// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const context = vi.hoisted(() => ({ admin: null as unknown as SupabaseClient }));
vi.mock("../../supabase/functions/_shared/transcript-http.ts", () => ({
  transcriptHandler: (
    _request: Request,
    _kind: string,
    run: (value: { admin: SupabaseClient }) => Promise<Response>,
  ) => run({ admin: context.admin }),
  transcriptJson: (body: unknown) => Response.json(body),
}));
vi.mock("../../supabase/functions/_shared/response-recordings.ts", () => ({}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({}));

let transcriptHandler: (request: Request) => Promise<Response>;
let dispatchClips: (admin: SupabaseClient) => Promise<void>;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: () => "https://media.example" },
    serve: (handler: typeof transcriptHandler) => {
      transcriptHandler = handler;
    },
  });
  const entry = "../../supabase/functions/dispatch-recording-transcripts/index.ts";
  await import(entry);
  const shared = "../../supabase/functions/_shared/recording-clips.ts";
  ({ dispatchClips } = await import(shared));
});
afterAll(() => vi.unstubAllGlobals());

function database(options: { empty?: boolean; sourceFailure?: boolean } = {}) {
  const job = {
    id: "job",
    response_id: "response",
    attempt_id: "attempt",
    source_bucket: options.sourceFailure ? "legacy" : "r2:recordings",
    source_path: "private.webm",
    start_ms: 0,
    end_ms: 15000,
  };
  const rpc = vi.fn(async (name: string, _parameters?: Record<string, unknown>) => ({
    data: name.startsWith("claim_") ? (options.empty ? [] : [job]) : false,
    error: null,
  }));
  const admin = {
    rpc,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: new Error("Unavailable") }),
      }),
    },
  } as unknown as SupabaseClient;
  context.admin = admin;
  return { admin, rpc };
}

for (const kind of ["clip", "transcript"] as const) {
  describe(`${kind} dispatch recovery`, () => {
    const dispatch = (admin: SupabaseClient) =>
      kind === "clip"
        ? dispatchClips(admin)
        : transcriptHandler(new Request("https://backend.example/dispatch"));

    it.each([
      [202, null],
      [429, "busy"],
      [503, "busy"],
      [400, "failed"],
      [0, "busy"],
    ] as const)("handles transport/HTTP outcome %s", async (status, event) => {
      const { admin, rpc } = database();
      const send = vi.fn(async () => {
        if (!status) throw new TypeError("Network unavailable");
        return new Response(null, { status });
      });
      vi.stubGlobal("fetch", send);
      await dispatch(admin);
      expect(send).toHaveBeenCalledOnce();
      const finish = rpc.mock.calls.find(([name]) => name.startsWith("finish_"));
      if (event) expect(finish?.[1]).toMatchObject({ p_attempt_id: "attempt", p_event: event });
      else expect(finish).toBeUndefined();
    });

    it("does not wake compute for an empty queue", async () => {
      const { admin } = database({ empty: true });
      const send = vi.fn();
      vi.stubGlobal("fetch", send);
      await dispatch(admin);
      expect(send).not.toHaveBeenCalled();
    });

    it("preserves bounded failures when source preparation fails", async () => {
      const { admin, rpc } = database({ sourceFailure: true });
      const send = vi.fn();
      vi.stubGlobal("fetch", send);
      await dispatch(admin);
      expect(send).not.toHaveBeenCalled();
      expect(rpc.mock.calls.find(([name]) => name.startsWith("finish_"))?.[1]).toMatchObject({
        p_event: "failed",
      });
    });
  });
}
