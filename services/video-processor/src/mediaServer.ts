import { config } from "./config.js";
import { createMediaApp } from "./mediaApp.js";
import { MediaExecutor } from "./mediaLifecycle.js";
import { createTranscriptNotifier, TranscriptQueue } from "./transcriptQueue.js";
import { parseTranscriptJob, processRecordingTranscript } from "./transcriptProcessor.js";
import { ClipQueue, createClipNotifier } from "./clipQueue.js";
import { parseClipJob, processRecordingClip, deleteClipOutput } from "./clipProcessor.js";
import { assertBucketReachable } from "./r2Client.js";
import { cleanupLegacyThumbnails } from "./legacyThumbnailCleanup.js";

const executor = new MediaExecutor();
const notifyTranscript = createTranscriptNotifier(
  config.transcription.completionWebhookUrl,
  config.http.sharedSecret,
);
const notifyClip = createClipNotifier(config.clips.completionWebhookUrl, config.http.sharedSecret);
const transcripts = new TranscriptQueue(
  (job) =>
    executor.run(async () => {
      // A job can wait behind a clip; recheck its lease before reading private media.
      if (!(await notifyTranscript(job, "heartbeat"))) throw new Error("Lease revoked.");
      return processRecordingTranscript(job);
    }),
  notifyTranscript,
);
const clips = new ClipQueue(
  (job) =>
    executor.run(async () => {
      if (!(await notifyClip(job, "heartbeat"))) throw new Error("Lease revoked.");
      return processRecordingClip(job);
    }),
  notifyClip,
  deleteClipOutput,
);
const app = createMediaApp({
  secret: config.http.sharedSecret,
  transcripts,
  clips,
  parseTranscript: parseTranscriptJob,
  parseClip: parseClipJob,
  transcriptsConfigured: Boolean(
    config.transcription.apiKey && config.transcription.completionWebhookUrl,
  ),
  clipsConfigured: Boolean(config.clips.completionWebhookUrl),
  legacyThumbnailCleanup: cleanupLegacyThumbnails,
});

try {
  await assertBucketReachable(config.r2.sourceBucketName);
  app.listen(config.http.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ service: "media-processor", port: config.http.port }));
  });
} catch {
  console.error("Media processor could not access its recording bucket.");
  process.exitCode = 1;
}
