import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestRecordingPreviews } from "../../src/lib/recordingPreviews";
import { RECORDING_CONFIRMATION_TIMEOUT_MS, uploadRecordingDraft } from "../../src/lib/recordings";

const auth = vi.hoisted(() => ({ userId: "owner-one" }));
vi.mock("../../src/lib/supabase", () => ({
  supabaseUrl: "https://example.test",
  supabasePublishableKey: "public-test-key",
  requireSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: auth.userId }, access_token: "test-session" } },
        error: null,
      }),
    },
  }),
}));
beforeEach(() => {
  auth.userId = "owner-one";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("upload confirmation recovery", () => {
  it.each(["storage", "metadata"])(
    "bounds a stalled %s confirmation and safely retries",
    async (stage) => {
      vi.useFakeTimers();
      let stalled = true;
      let puts = 0;
      let aborted = false;
      const progress: string[] = [];
      class Request {
        upload: { onprogress?: (event: { loaded: number }) => void } = {};
        onload?: () => void;
        onabort?: () => void;
        status = 200;
        open() {}
        setRequestHeader() {}
        getResponseHeader() {
          return null;
        }
        abort() {
          aborted = true;
          this.onabort?.();
        }
        send(body: Blob) {
          puts++;
          this.upload.onprogress?.({ loaded: body.size });
          if (!(stalled && stage === "storage")) this.onload?.();
        }
      }
      vi.stubGlobal("XMLHttpRequest", Request);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const payload = JSON.parse(String(init.body));
          if (stalled && stage === "metadata" && payload.action === "complete_single") {
            return new Promise<Response>((_resolve, reject) => {
              init.signal!.addEventListener("abort", () => {
                aborted = true;
                reject(init.signal!.reason);
              });
            });
          }
          return new Response(
            JSON.stringify({ ok: true, uploadUrl: "https://storage.test/video" }),
          );
        }),
      );
      const file = new File(["video"], "recording.webm", { type: "video/webm" });
      const upload = () =>
        uploadRecordingDraft("owner", "confirmation-" + stage, file, null, {
          publicTesterKey: "tester",
          path: "draft/confirmation-" + stage + "/recording.webm",
          onProgress: (value) => progress.push(value.state),
        });
      const result = upload();
      const rejected = expect(result).rejects.toThrow(/confirm|too long/i);
      await vi.advanceTimersByTimeAsync(RECORDING_CONFIRMATION_TIMEOUT_MS);
      await rejected;
      expect(aborted).toBe(true);
      expect(progress).toContain("finalizing");
      expect(puts).toBe(1);
      stalled = false;
      await expect(upload()).resolves.toMatchObject({ fileSizeBytes: file.size });
      // Once storage acknowledged the PUT, retry only the metadata confirmation.
      expect(puts).toBe(stage === "metadata" ? 1 : 2);
    },
  );
});

describe("preview request coalescing", () => {
  it("joins identical in-flight requests but keeps owners isolated", async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ recordings: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([
      requestRecordingPreviews({ force: true, responseIds: ["a", "b"] }),
      requestRecordingPreviews({ force: true, responseIds: ["b", "a"] }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    auth.userId = "owner-two";
    await requestRecordingPreviews({ responseIds: ["a", "b"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("clears failed in-flight requests so retry can succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recordings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestRecordingPreviews({ force: true })).rejects.toThrow("offline");
    await expect(requestRecordingPreviews({ force: true })).resolves.toEqual([]);
  });
});

describe("multipart uploads", () => {
  it.each([true, false])(
    "keeps bytes, sorted completion and monotonic progress with batch support %s",
    async (supportsBatchSigning) => {
      let active = 0,
        peak = 0;
      let omitNextEtag = false;
      const sent: number[] = [];
      class Request {
        upload: { onprogress?: (event: { loaded: number }) => void } = {};
        onload?: () => void;
        status = 200;
        url = "";
        open(_method: string, url: string) {
          this.url = url;
        }
        setRequestHeader() {}
        getResponseHeader() {
          if (omitNextEtag && this.url === "1") {
            omitNextEtag = false;
            return null;
          }
          return `"etag-${this.url}"`;
        }
        send(body: Blob) {
          peak = Math.max(peak, ++active);
          const part = Number(this.url);
          sent.push(part);
          setTimeout(() => {
            this.upload.onprogress?.({ loaded: body.size });
            active--;
            this.onload?.();
          }, part % 3);
        }
      }
      vi.stubGlobal("XMLHttpRequest", Request);
      const requests: Array<Record<string, any>> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(String(init.body));
          requests.push(request);
          return new Response(
            JSON.stringify({
              ok: true,
              ...(request.action === "initiate_multipart"
                ? { uploadId: "upload", partSizeBytes: 10 * 1024 * 1024, supportsBatchSigning }
                : request.action === "sign_parts"
                  ? {
                      signedParts: request.partNumbers.map((partNumber: number) => ({
                        partNumber,
                        uploadUrl: String(partNumber),
                      })),
                    }
                  : { uploadUrl: String(request.partNumber) }),
            }),
          );
        }),
      );
      // A sparse File stand-in exercises the multipart threshold without allocating 105 MiB.
      const file = {
        size: 105 * 1024 * 1024,
        name: "recording.webm",
        type: "video/webm",
        slice: (start: number, end: number) => ({ size: end - start }),
      } as File;
      const progress: number[] = [];
      const result = await uploadRecordingDraft(
        "owner",
        `session-${supportsBatchSigning}`,
        file,
        null,
        {
          publicTesterKey: "test-public-tester",
          onProgress: (value) => progress.push(value.bytesUploaded),
        },
      );
      expect(result.fileSizeBytes).toBe(file.size);
      expect(peak).toBe(3);
      expect(sent.sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
      expect(
        requests[requests.length - 1]?.parts.map((part: { partNumber: number }) => part.partNumber),
      ).toEqual(sent);
      expect(progress.every((value, index) => !index || value >= progress[index - 1])).toBe(true);
      expect(progress[progress.length - 1]).toBe(file.size);
      expect(
        requests.filter(
          (request) => request.action === (supportsBatchSigning ? "sign_parts" : "sign_part"),
        ),
      ).toHaveLength(supportsBatchSigning ? 4 : 11);
      // Retry after one failed part must retain other in-flight parts that succeeded.
      sent.length = 0;
      requests.length = 0;
      omitNextEtag = true;
      const resume = () =>
        uploadRecordingDraft("owner", `resume-${supportsBatchSigning}`, file, null, {
          publicTesterKey: "test-public-tester",
          path: `draft/owner/resume-${supportsBatchSigning}/recording.webm`,
        });
      await expect(resume()).rejects.toThrow("ETag");
      expect(active).toBe(0);
      const completedBeforeRetry = sent.filter((part) => part !== 1);
      await resume();
      for (const part of completedBeforeRetry)
        expect(sent.filter((value) => value === part)).toHaveLength(1);
      expect(requests.filter((request) => request.action === "initiate_multipart")).toHaveLength(1);
      expect(
        requests[requests.length - 1].parts.map((part: { partNumber: number }) => part.partNumber),
      ).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    },
  );
});
