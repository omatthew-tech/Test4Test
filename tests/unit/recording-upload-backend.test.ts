// @vitest-environment node
import { afterAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: {
    id: "upload",
    upload_id: "multipart",
    status: "uploading",
    attached_response_id: null,
  } as Record<string, unknown>,
  backgroundRead: null as Promise<unknown> | null,
  upsert: vi.fn(),
  r2: vi.fn(),
  tasks: [] as Promise<unknown>[],
  enqueue: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/response-recordings.ts", () => ({
  recordingCorsHeaders: {},
  recordingJson: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  createRecordingAdminClient: () => ({
    from: () => {
      let selection = "";
      const builder = {
        select: (value: string) => {
          selection = value;
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () =>
          selection === "*" && mocks.backgroundRead
            ? mocks.backgroundRead
            : { data: mocks.row, error: null },
        upsert: mocks.upsert,
      };
      return builder;
    },
  }),
}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({
  getR2RecordingEnvironment: () => ({ providerBucket: "r2:test" }),
  validateR2RecordingObjectInput: () => "video/webm",
  validateR2RecordingThumbnailInput: vi.fn(),
  buildCompleteMultipartXml: () => "<CompleteMultipartUpload />",
  createR2PresignedUrl: vi.fn(),
  parseR2UploadId: vi.fn(),
  r2Fetch: mocks.r2,
}));
vi.mock("../../supabase/functions/_shared/recording-thumbnails.ts", () => ({
  enqueueRecordingThumbnailBatch: mocks.enqueue,
  scheduleRecordingThumbnailTask: (task: Promise<unknown>) => mocks.tasks.push(task),
}));
let handler: (request: Request) => Promise<Response>;
vi.stubGlobal("Deno", {
  serve: (value: typeof handler) => {
    handler = value;
  },
});
const modulePath = "../../supabase/functions/recording-upload-r2/index.ts";
await import(modulePath);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  mocks.row = {
    id: "upload",
    upload_id: "multipart",
    status: "uploading",
    attached_response_id: null,
  };
  mocks.backgroundRead = null;
  mocks.tasks = [];
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.r2.mockReset().mockImplementation(async () => new Response(null, { status: 200 }));
  mocks.enqueue.mockReset().mockResolvedValue({});
});
const complete = (action = "complete_multipart") =>
  handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        action,
        publicTesterKey: "public-tester-key",
        path: "draft/video.webm",
        fileName: "video.webm",
        fileSizeBytes: 100,
        mimeType: "video/webm",
        uploadId: "multipart",
        parts: [{ partNumber: 1, etag: "etag" }],
      }),
    }),
  );

it("returns upload success without waiting for the thumbnail lookup", async () => {
  let finish!: (value: unknown) => void;
  mocks.backgroundRead = new Promise((resolve) => {
    finish = resolve;
  });
  const response = await complete("complete_single");
  expect(response.status).toBe(200);
  expect(mocks.tasks).toHaveLength(1);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  finish({ data: mocks.row, error: null });
  await Promise.all(mocks.tasks);
  expect(mocks.enqueue).toHaveBeenCalledOnce();
});

it("reconfirms a completed multipart upload without completing its consumed ID again", async () => {
  mocks.row.status = "completed";
  expect((await complete()).status).toBe(200);
  expect(mocks.r2).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it.each([true, false])(
  "recovers a lost multipart response only when the object exists (%s)",
  async (exists) => {
    mocks.r2.mockResolvedValueOnce(new Response("<Code>NoSuchUpload</Code>", { status: 404 }));
    mocks.r2.mockResolvedValueOnce(new Response(null, { status: exists ? 200 : 404 }));
    expect((await complete()).status).toBe(exists ? 200 : 400);
    expect(mocks.upsert).toHaveBeenCalledTimes(exists ? 1 : 0);
    await Promise.all(mocks.tasks);
  },
);

it.each([
  { status: "deleted" },
  { attached_response_id: "submitted" },
  { upload_id: "other-upload" },
])("rejects a multipart retry outside its original draft: %j", async (row) => {
  Object.assign(mocks.row, row);
  expect((await complete()).status).toBe(400);
  expect(mocks.r2).not.toHaveBeenCalled();
});
