import { clipHandler, clipJson } from "../_shared/clip-http.ts";
import { cleanupClipAssets, dispatchClips } from "../_shared/recording-clips.ts";

Deno.serve((request) =>
  clipHandler(request, "dispatcher", async ({ admin, body }) => {
    if (body.action === "cleanup") {
      const deleted = await cleanupClipAssets(admin);
      return clipJson({ ok: true, deleted });
    }
    await dispatchClips(admin);
    return clipJson({ ok: true });
  }),
);
