import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRecordingShareUrl, loadSharedRecording } from "../../src/lib/recordingShare";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "publishable-key",
  requireSupabase: () => ({ auth: { getSession } }),
}));
beforeEach(() => {
  getSession
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "owner-token" } }, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, shareToken: "opaque-token" }),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("creates a fragment link for the selected recording using the owner's session", async () => {
  const url = new URL(await createRecordingShareUrl("selected-response"));
  expect(url.pathname).toBe("/recordings/shared");
  expect(url.hash).toBe("#opaque-token");
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: JSON.stringify({ responseId: "selected-response", action: "share" }),
      headers: expect.objectContaining({ Authorization: "Bearer owner-token" }),
    }),
  );
});

it("allows guests to resolve a link without accessing an auth session", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({ ok: true, url: "https://media.example/video.webm", productName: "Example" }),
    ),
  );
  expect((await loadSharedRecording("opaque-token")).url).toBe("https://media.example/video.webm");
  expect(getSession).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: JSON.stringify({ shareToken: "opaque-token" }),
      headers: { "Content-Type": "application/json", apikey: "publishable-key" },
    }),
  );
});

it("reports missing sign-in and does not create a fake link", async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  await expect(createRecordingShareUrl("response")).rejects.toThrow("Sign in again");
  expect(fetch).not.toHaveBeenCalled();
});

it("reports unavailable links and missing tokens", async () => {
  await expect(loadSharedRecording("")).rejects.toThrow("invalid");
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "This shared recording is no longer available." }), {
      status: 410,
    }),
  );
  await expect(loadSharedRecording("old-token")).rejects.toThrow("no longer available");
});
