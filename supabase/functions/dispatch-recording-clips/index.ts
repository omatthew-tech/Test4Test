import { clipHandler, clipJson } from "../_shared/clip-http.ts";
import { cleanupClipAssets, dispatchClips } from "../_shared/recording-clips.ts";

Deno.serve((request) =>
  clipHandler(request, "dispatcher", async ({ admin }) => {
    await dispatchClips(admin);
    const deleted = await cleanupClipAssets(admin);
    return clipJson({ ok: true, deleted });
  }),
);
