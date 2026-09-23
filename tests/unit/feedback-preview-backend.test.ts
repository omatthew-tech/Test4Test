// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const { dispatchClips, createR2PresignedUrl } = vi.hoisted(() => ({
  dispatchClips: vi.fn().mockResolvedValue(undefined),
  createR2PresignedUrl: vi.fn().mockResolvedValue("https://media.example/preview.mp4"),
}));
vi.mock("../../supabase/functions/_shared/recording-clips.ts", () => ({
  dispatchClips,
}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({
  getR2RecordingEnvironment: () => ({}),
  createR2PresignedUrl,
}));
const rpc = vi.fn();
const admin = { rpc } as unknown as SupabaseClient;
const source = {
  responseId: "response",
  ownerId: "owner",
  bucket: "r2:recordings",
  path: "private/full.webm",
  durationSeconds: 120,
};
let feedbackPreview: (
  admin: SupabaseClient,
  input: typeof source & { versionId?: string },
) => Promise<unknown>;
beforeAll(async () => {
  const path = "../../supabase/functions/_shared/feedback-preview.ts";
  ({ feedbackPreview } = await import(path));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => "worker-secret" } });
  rpc.mockResolvedValue({ data: { status: "pending" }, error: null });
});
afterEach(() => vi.unstubAllGlobals());
it("creates only the first 15 seconds and reuses the job for repeated and concurrent requests", async () => {
  await Promise.all([feedbackPreview(admin, source), feedbackPreview(admin, source)]);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(rpc).toHaveBeenCalledWith(
    "create_recording_clip",
    expect.objectContaining({
      p_start_ms: 0,
      p_end_ms: 15000,
      p_creator_id: "owner",
      p_response_id: "response",
    }),
  );
  expect(createR2PresignedUrl).not.toHaveBeenCalled();
  expect(dispatchClips).toHaveBeenCalled();
});
it("signs only the finished derivative and never returns a public capability or original source", async () => {
  rpc.mockImplementation(async (_name, input) => ({
    data: {
      status: "ready",
      attempt_id: "attempt",
      output_path: `recording-clips/${input.p_id}/attempt.mp4`,
      start_ms: 0,
      end_ms: 15000,
    },
    error: null,
  }));
  const result = await feedbackPreview(admin, source);
  expect(result).toMatchObject({
    status: "ready",
    previewSeconds: 15,
    url: "https://media.example/preview.mp4",
  });
  expect(createR2PresignedUrl).toHaveBeenCalledWith(
    {},
    "GET",
    expect.stringMatching(/^recording-clips\/.+\/attempt\.mp4$/),
    { expiresInSeconds: 300 },
  );
  expect(JSON.stringify(result)).not.toMatch(/full.webm|worker-secret|token|owner/);
});
it("binds jobs to the owner, source and exact version and supports short recordings", async () => {
  await feedbackPreview(admin, source);
  await feedbackPreview(admin, { ...source, versionId: "revision" });
  await feedbackPreview(admin, { ...source, path: "replacement.webm" });
  await feedbackPreview(admin, { ...source, ownerId: "different-owner" });
  expect(new Set(rpc.mock.calls.map((call) => call[1].p_id)).size).toBe(4);
  await feedbackPreview(admin, { ...source, durationSeconds: 7.2 });
  expect(rpc).toHaveBeenLastCalledWith(
    "create_recording_clip",
    expect.objectContaining({ p_end_ms: 7200 }),
  );
});
it.each([null, { status: "failed" }, { status: "ready", output_path: "private/full.webm" }])(
  "never falls back to full media for a failed or invalid preview",
  async (clip) => {
    rpc.mockResolvedValue({ data: clip, error: null });
    await expect(feedbackPreview(admin, source)).rejects.toThrow();
    expect(createR2PresignedUrl).not.toHaveBeenCalled();
  },
);
