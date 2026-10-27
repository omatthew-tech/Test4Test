import express, { type RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { MediaLifecycle } from "./mediaLifecycle.js";

interface Queue<T> {
  readonly size: number;
  enqueue(job: T): void;
}
export function createMediaApp<T, C>(options: {
  secret: string;
  transcripts: Queue<T>;
  clips: Queue<C>;
  parseTranscript: (body: unknown) => T | null;
  parseClip: (body: unknown) => C | null;
  transcriptsConfigured: boolean;
  clipsConfigured: boolean;
  legacyThumbnailCleanup?: RequestHandler;
}) {
  if (!options.secret) throw new Error("Media authentication is required.");
  const app = express();
  let cleanupRequests = 0;
  const lifecycle = new MediaLifecycle(
    () => options.transcripts.size + options.clips.size + cleanupRequests,
  );
  app.get("/healthz", (_req, res) => res.json({ ok: true, service: "media-processor" }));
  app.use((req, res, next) => {
    const supplied = Buffer.from(req.header("x-worker-secret") ?? "");
    const expected = Buffer.from(options.secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    next();
  });
  app.post("/internal/prepare-sleep", (_req, res) => {
    res.json({ idle: lifecycle.prepareToSleep() });
  });
  app.use(express.json({ limit: "128kb" }));
  // Existing explicit-deletion contract, behind the same shared-secret gate.
  if (options.legacyThumbnailCleanup)
    app.post("/frames/delete", async (req, res, next) => {
      if (!lifecycle.accepting) {
        res.status(503).json({ error: "Media worker is stopping. Retry later." });
        return;
      }
      cleanupRequests++;
      try {
        await options.legacyThumbnailCleanup!(req, res, next);
      } finally {
        cleanupRequests--;
      }
    });
  function register<J>(
    path: string,
    queue: Queue<J>,
    parse: (body: unknown) => J | null,
    configured: boolean,
  ) {
    app.post(path, (req, res) => {
      if (!configured || !lifecycle.accepting) {
        res.status(503).json({ error: "Media worker is unavailable. Retry later." });
        return;
      }
      const job = parse(req.body);
      if (!job) {
        res.status(400).json({ error: "Invalid media job." });
        return;
      }
      try {
        queue.enqueue(job);
        res.status(202).json({ ok: true, attemptId: req.body.attemptId });
      } catch {
        res.status(429).json({ error: "Media worker is busy." });
      }
    });
  }
  register(
    "/recordings/transcripts/process",
    options.transcripts,
    options.parseTranscript,
    options.transcriptsConfigured,
  );
  register("/recordings/clips/process", options.clips, options.parseClip, options.clipsConfigured);
  app.use((_req, res) => res.status(410).json({ error: "Endpoint retired or unavailable." }));
  return app;
}
