// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ admin: null as unknown as SupabaseClient }));
vi.mock("../../supabase/functions/_shared/response-recordings.ts", () => ({
  createRecordingAdminClient: () => context.admin,
  getRecordingEnvironment: () => ({}),
  recordingCorsHeaders: {},
}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({
  getR2RecordingEnvironment: () => ({}),
  r2Fetch: vi.fn(),
  buildDownloadContentDisposition: () => "attachment; filename=clip.mp4",
  createR2PresignedUrl: vi
    .fn()
    .mockImplementation(async (_env, _method, path) => `https://private.example/${path}`),
}));
const responseId = "20000000-0000-4000-8000-000000000001",
  id = "40000000-0000-4000-8000-000000000001";
const attempt = "50000000-0000-4000-8000-000000000001",
  token = "a".repeat(64);
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let handler: (request: Request) => Promise<Response>;
let rpc: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (value: typeof handler) => {
      handler = value;
    },
    env: { get: () => "fixture" },
  });
  const entry = "../../supabase/functions/recording-clips/index.ts";
  await import(entry);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  rows = {
    test_responses: [
      {
        id: responseId,
        submission_id: "app",
        tester_user_id: "tester",
        recording_bucket: "r2:recordings",
        recording_path: "private-full.webm",
        recording_deleted_at: null,
      },
    ],
    submissions: [{ id: "app", user_id: "owner", product_name: "Example app" }],
    test_response_versions: [],
    recording_clips: [
      {
        id,
        response_id: responseId,
        creator_id: "owner",
        version_id: null,
        source_bucket: "r2:recordings",
        source_path: "private-full.webm",
        token_hash: tokenHash,
        status: "ready",
        start_ms: 1000,
        end_ms: 5000,
        attempt_id: attempt,
        output_path: `recording-clips/${id}/${attempt}.mp4`,
      },
    ],
  };
  rpc = vi.fn().mockImplementation(async (name) => ({
    data: name === "create_recording_clip" ? { id, status: "pending" } : [],
    error: null,
  }));
  context.admin = {
    auth: {
      getUser: async (jwt: string) => ({
        data: { user: jwt === "invalid" ? null : { id: jwt } },
        error: null,
      }),
    },
    rpc,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let remove = false;
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        maybeSingle: () => query,
        delete: () => {
          remove = true;
          return query;
        },
        then(resolve: (value: { data: Row | null; error: null }) => void) {
          const found = rows[table].find((row) => filters.every((filter) => filter(row))) ?? null;
          if (remove) rows[table] = rows[table].filter((row) => row !== found);
          return Promise.resolve(resolve({ data: found, error: null }));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
});
async function call(body: Row, user?: string) {
  const response = await handler(
    new Request("https://api.example/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: `Bearer ${user}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}
const create = { action: "create", id, token, responseId, startMs: 1000, endMs: 5000 };
it("requires a validated session and ownership before creating an export", async () => {
  expect((await call(create)).status).toBe(401);
  expect((await call(create, "invalid")).status).toBe(401);
  expect((await call(create, "stranger")).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect((await call(create, "owner")).status).toBe(202);
  const args = rpc.mock.calls.find(([name]) => name === "create_recording_clip")![1];
  expect(args.p_token_hash).not.toBe(token);
  expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(args.p_source_path).toBe("private-full.webm");
});
it("allows the tester but rejects malformed ranges and unowned versions", async () => {
  expect((await call(create, "tester")).status).toBe(202);
  expect((await call({ ...create, endMs: 500 }, "owner")).status).toBe(400);
  expect((await call({ ...create, startMs: 1.2 }, "owner")).status).toBe(400);
  expect((await call({ ...create, versionId: id }, "owner")).status).toBe(410);
});

it("blocks new clips for locked feedback without revoking existing public clips", async () => {
  rows.test_responses[0].feedback_source = "earn";
  rpc.mockResolvedValue({ data: [{ response_id: responseId, access: "locked" }], error: null });
  expect((await call(create, "owner")).status).toBe(403);
  expect((await call(create, "tester")).status).toBe(403);
  expect(rpc.mock.calls.every(([name]) => name !== "create_recording_clip")).toBe(true);
  expect((await call({ action: "public", token })).status).toBe(200);
});
it("guest capability returns only clip media and approved metadata", async () => {
  const result = await call({ action: "public", token });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({
    ok: true,
    status: "ready",
    productName: "Example app",
    durationMs: 4000,
    url: `https://private.example/recording-clips/${id}/${attempt}.mp4`,
    downloadUrl: `https://private.example/recording-clips/${id}/${attempt}.mp4`,
  });
  expect(JSON.stringify(result.body)).not.toContain("private-full");
  expect((await call({ action: "public", token, responseId })).status).toBe(404);
  expect((await call({ action: "public", token: "b".repeat(64) })).status).toBe(404);
});
it("never returns source media while processing or after replacement/deletion", async () => {
  rows.recording_clips[0].status = "processing";
  expect((await call({ action: "public", token })).body.url).toBeUndefined();
  rows.test_responses[0].recording_path = "replacement.webm";
  expect((await call({ action: "public", token })).status).toBe(410);
  rows.test_responses[0].recording_deleted_at = new Date().toISOString();
  expect((await call({ action: "public", token })).status).toBe(410);
});
it("only the creator can manage their clip and deletion revokes the public token", async () => {
  expect((await call({ action: "delete", id }, "stranger")).status).toBe(404);
  expect((await call({ action: "delete", id }, "owner")).status).toBe(200);
  expect((await call({ action: "public", token })).status).toBe(404);
});
