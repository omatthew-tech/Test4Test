// @vitest-environment node
import { afterAll, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  submissions: [{ id: "app", product_name: "Example" }],
  scope: [] as unknown[][],
  access: vi.fn(),
  imageWork: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/response-recordings.ts", () => ({
  recordingCorsHeaders: {},
  recordingJson: (body: unknown, status = 200) => Response.json(body, { status }),
  getRecordingEnvironment: () => ({}),
  createRecordingAdminClient: () => ({
    auth: { getUser: async () => ({ data: { user: api.user }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          api.scope.push([table, "eq", ...args]);
          return query;
        },
        in: (...args: unknown[]) => {
          api.scope.push([table, "in", ...args]);
          return query;
        },
        is: (...args: unknown[]) => {
          api.scope.push([table, "is", ...args]);
          return query;
        },
        not: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            error: null,
            data:
              table === "submissions"
                ? api.submissions
                : [
                    {
                      id: "free",
                      submission_id: "app",
                      feedback_source: "direct",
                      submitted_at: "2026-10-26",
                      duration_seconds: 60,
                    },
                    {
                      id: "locked",
                      submission_id: "app",
                      feedback_source: "earn",
                      submitted_at: "2026-10-25",
                      duration_seconds: 60,
                    },
                  ],
          }),
      };
      return query;
    },
  }),
}));
vi.mock("../../supabase/functions/_shared/feedback-access.ts", () => ({
  receivedFeedbackAccess: api.access,
}));
vi.mock("../../supabase/functions/_shared/recording-thumbnails.ts", () => ({
  RECORDING_THUMBNAIL_SIGNED_URL_SECONDS: 3600,
  RECORDING_THUMBNAIL_GENERATION_VERSION: "scene-after-half-v1",
  signRecordingThumbnails: api.imageWork,
  enqueueRecordingThumbnailBatch: api.imageWork,
  enqueueRecordingThumbnailSources: api.imageWork,
  scheduleRecordingThumbnailTask: api.imageWork,
}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({
  getR2RecordingEnvironment: api.imageWork,
  createR2PresignedUrl: api.imageWork,
}));
let handler: (request: Request) => Promise<Response>;
vi.stubGlobal("Deno", {
  serve: (fn: typeof handler) => {
    handler = fn;
  },
});
const modulePath = "../../supabase/functions/get-recording-previews/index.ts";
await import(modulePath);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  api.user = { id: "owner" };
  api.submissions = [{ id: "app", product_name: "Example" }];
  api.scope = [];
  api.access.mockReset().mockResolvedValue(new Map([["locked", "locked"]]));
  api.imageWork.mockReset().mockResolvedValue(new Map());
});
const request = (authenticated = true) =>
  handler(
    new Request("https://example.test", {
      method: "POST",
      headers: authenticated ? { Authorization: "Bearer token" } : {},
      body: "{}",
    }),
  );
it("requires an authenticated owner", async () => {
  expect((await request(false)).status).toBe(401);
  api.user = null;
  expect((await request()).status).toBe(401);
  expect(api.scope).toEqual([]);
});
it("keeps ownership, deletion and locked-feedback boundaries without thumbnail work", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(api.scope).toContainEqual(["submissions", "eq", "user_id", "owner"]);
  expect(api.scope).toContainEqual(["test_responses", "in", "submission_id", ["app"]]);
  expect(api.scope).toContainEqual(["test_responses", "is", "recording_deleted_at", null]);
  expect(api.access).toHaveBeenCalledWith(expect.anything(), "owner", ["locked"]);
  expect(body.recordings).toEqual([
    expect.objectContaining({
      responseId: "free",
      feedbackAccess: "free",
      thumbnail: null,
      thumbnailStatus: "ready",
    }),
    expect.objectContaining({
      responseId: "locked",
      feedbackAccess: "locked",
      thumbnail: null,
      thumbnailStatus: "ready",
    }),
  ]);
  expect(api.imageWork).not.toHaveBeenCalled();
});
it("fails closed when feedback access cannot be verified", async () => {
  api.access.mockRejectedValue(new Error("database unavailable"));
  expect((await request()).status).toBe(503);
  expect(api.imageWork).not.toHaveBeenCalled();
});
