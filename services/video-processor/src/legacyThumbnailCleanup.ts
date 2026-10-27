import type { Request, Response } from "express";
import { config } from "./config.js";
import { deleteObjects } from "./r2Client.js";

/** Preserve the existing /frames/delete contract used by source-deletion cleanup.
 * This does not enqueue generation or remove images as part of the migration.
 */
export async function cleanupLegacyThumbnails(req: Request, res: Response) {
  const entries = Array.isArray(req.body?.frames) ? req.body.frames.slice(0, 200) : [];
  const frames: Array<{ id: string; key: string }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const bucket = typeof entry.bucket === "string" ? entry.bucket.trim().replace(/^r2:/i, "") : "";
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (id && bucket === config.thumbnails.bucketName && key.startsWith("recording-thumbnails/"))
      frames.push({ id, key });
  }
  if (!frames.length) {
    res.status(400).json({ error: "At least one generated recording thumbnail is required." });
    return;
  }
  try {
    await deleteObjects({
      bucket: config.thumbnails.bucketName,
      keys: frames.map((frame) => frame.key),
    });
    res.json({ ok: true, deletedIds: frames.map((frame) => frame.id) });
  } catch {
    res.status(502).json({ error: "Recording thumbnails could not be deleted." });
  }
}
