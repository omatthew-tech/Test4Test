# video-processor

Asynchronous Node.js worker that turns usability-test screen recordings into a
set of **unique, timestamped app-page screenshots** stored in Cloudflare R2 and
normalized Groq Whisper transcripts returned in report job results.

It exists as a standalone service because the rest of the Test4Test backend runs
on Supabase Edge Functions (Deno), which cannot run `ffmpeg`. This worker does
the heavy video processing and writes results back to R2 (and, optionally, to a
completion webhook).

## Current integration status

Thumbnail generation and private recording access have an active worker and
Supabase integration in the current worktree. Report processing can generate
timestamped transcript JSON, and the job result includes normalized segments and
words.

Durable recording-transcript persistence is not complete. The repository does
not yet contain the canonical transcript/word migrations, lifecycle and retry
orchestration, owner transcript viewer, exact-range annotations, app-level
priorities, clips, or AI context filtering required by the recording-first
product specification. A completion webhook is optional infrastructure, not
evidence that those product contracts are implemented.

Future transcript integration must treat the source recording’s 60-day
expiration as authoritative, use idempotent pending/processing/ready/failed jobs,
apply ownership-based RLS and explicit grants, and delete transcript data with
the source. See [`../../usability_platform_product_plan.md`](../../usability_platform_product_plan.md)
and [`../../supabase/README.md`](../../supabase/README.md).

## Why a background job (not a synchronous API)?

Video frame extraction is CPU- and IO-bound and can take **seconds to minutes**
per recording. Doing that inside a single HTTP request would:

- exceed typical gateway/load-balancer timeouts (30–60s),
- hold a connection open and block the event loop / worker slot,
- give the client no progress signal and no safe retry story.

So the API is **fire-and-poll**:

1. `POST /reports/process` validates input, enqueues a job, returns **202** with a `jobId`.
2. The job runs in the background with bounded concurrency.
3. The client polls `GET /jobs/:jobId` until `status` is `completed` or `failed`.
4. Optionally, the worker POSTs the final manifest to `COMPLETION_WEBHOOK_URL`.

The in-process queue (`src/jobQueue.ts`) is ideal for a single instance. For
multiple instances or durability across restarts, replace it with a Redis-backed
queue (e.g. **BullMQ**) — the `enqueue` / `get` surface stays the same.

## How exact timestamps are guaranteed

`src/frameExtractor.ts` uses a two-pass approach:

1. **Detect** scene-change timestamps via ffmpeg `select='gt(scene,T)',showinfo`,
   parsing the exact `pts_time:` values from ffmpeg's output.
2. **Extract** one frame per timestamp by seeking directly to that offset
   (`-ss <seconds>`), so each screenshot's timestamp is exact rather than
   inferred from output ordering.

Near-duplicate frames are removed with a 64-bit average perceptual hash
(Hamming-distance threshold), leaving a set of distinct app pages. The exact
`timestampMs` for every frame is:

- embedded in the **object key** (`...-00012345ms.webp`),
- stored as R2 **object metadata** (`timestamp-ms`),
- recorded in the per-report **manifest.json**, and
- returned in the **job result**.

## Setup

```bash
cd services/video-processor
cp .env.example .env   # fill in Cloudflare R2 and Groq credentials
npm install
npm run dev            # or: npm run build && npm start
```

`ffmpeg`/`ffprobe` binaries are provided by the `ffmpeg-static` /
`ffprobe-static` dependencies — no system install required.

## Configuration

All R2 credentials are read **strictly from environment variables** (see
`src/config.ts`); nothing is hardcoded. Required:

| Variable                       | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`        | Cloudflare account id                           |
| `CLOUDFLARE_ACCESS_KEY_ID`     | R2 access key id                                |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | R2 secret access key                            |
| `CLOUDFLARE_BUCKET_NAME`       | Destination bucket for generated frames         |
| `CLOUDFLARE_ENDPOINT`          | `https://<account_id>.r2.cloudflarestorage.com` |
| `GROQ_API_KEY`                 | Groq API key for uncached report transcription  |
| `WORKER_SHARED_SECRET`         | Secret required by worker and Supabase calls    |

Optional: `CLOUDFLARE_SOURCE_BUCKET_NAME`, `PORT`, `JOB_CONCURRENCY`,
`COMPLETION_WEBHOOK_URL`, the `FRAME_*` tuning knobs, and Groq transcription
knobs:

| Variable                              | Default                  | Description                                           |
| ------------------------------------- | ------------------------ | ----------------------------------------------------- |
| `GROQ_TRANSCRIPTION_MODEL`            | `whisper-large-v3-turbo` | Whisper model id persisted with transcript cache rows |
| `GROQ_TRANSCRIPTION_LANGUAGE`         | empty                    | Optional ISO-639-1 language hint, e.g. `en`           |
| `GROQ_TRANSCRIPTION_PROMPT`           | empty                    | Optional prompt for product names or spelling hints   |
| `GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES` | `20971520`               | Safe direct-upload size before chunking               |
| `GROQ_TRANSCRIPTION_CHUNK_SECONDS`    | `600`                    | Initial chunk duration for larger audio files         |

Analytics thumbnail jobs use these optional settings:

| Variable                           | Default               | Description                                           |
| ---------------------------------- | --------------------- | ----------------------------------------------------- |
| `THUMBNAIL_BUCKET_NAME`            | report frames bucket  | Dedicated bucket for private Analytics preview images |
| `THUMBNAIL_COMPLETION_WEBHOOK_URL` | empty                 | Shared-secret-protected Supabase completion callback  |
| `THUMBNAIL_GENERATION_VERSION`     | `scene-after-half-v1` | Version embedded in object keys and callback metadata |
| `THUMBNAIL_JOB_CONCURRENCY`        | `1`                   | Concurrent thumbnail jobs                             |
| `THUMBNAIL_QUEUE_MAX_PENDING`      | `32`                  | Maximum active plus pending thumbnail jobs            |
| `THUMBNAIL_MAX_BATCH_SIZE`         | `16`                  | Maximum recordings accepted by one request            |

Use the same value for `WORKER_SHARED_SECRET` here and
`VIDEO_PROCESSOR_SHARED_SECRET` in Supabase. The source bucket must be
`test-response-recordings`. Set `THUMBNAIL_BUCKET_NAME` to
`usability-test-screenshots`; `CLOUDFLARE_BUCKET_NAME` remains the report-frame
destination.

The Supabase Edge Functions also read `GROQ_TRANSCRIPTION_MODEL` for transcript
cache lookups. If you override it here, set the same value as an Edge Function
secret.

## API

### `POST /recordings/thumbnails/process`

Enqueues a bounded thumbnail-only job and returns `202` with a `jobId`. This
path does not run transcription, report frame de-duplication, or report
manifest generation. Each source uses an R2 object key, or a short-lived signed
`url` for legacy recordings:

```json
{
  "sources": [
    {
      "recordingUploadId": "8f3c...",
      "responseId": "a1b2...",
      "bucket": "r2:test-response-recordings",
      "objectKey": "draft/<user>/<session>/rec.webm",
      "generationVersion": "scene-after-half-v1"
    }
  ]
}
```

The worker probes duration, scans from 50%, selects the first scene change at
or after halfway, and falls back to 55% when there is no candidate. It writes a
960px WebP to
`recording-thumbnails/scene-after-half-v1/<recordingUploadId>.webp`, then posts
successes and per-source failures to `THUMBNAIL_COMPLETION_WEBHOOK_URL`.

### `GET /recordings/thumbnails/jobs/:jobId`

Returns the thumbnail job status and its partial-success result. Re-enqueuing
the same recording/version while it is in flight returns the existing job.

After deploying the worker and Edge Functions, call
`enqueue-recording-thumbnail-backfill` with `x-worker-secret` and a body such as
`{"limit":2}`. Repeat only after the previous batch callback has settled; the
response returns `complete: true` when no active recording still needs the
current generation. This endpoint is intentionally unavailable without the
shared secret.

### `POST /reports/process`

Headers: `x-worker-secret: <WORKER_SHARED_SECRET>`.

```json
{
  "reportId": "8f3c...",
  "sources": [
    {
      "responseId": "a1b2...",
      "objectKey": "draft/<user>/<session>/rec.webm",
      "transcriptCached": false
    },
    { "responseId": "c3d4...", "url": "https://signed-url-to-video" }
  ]
}
```

Each source needs `responseId` plus either `objectKey` (downloaded from R2) or
`url` (downloaded directly). When `transcriptCached` is true, the worker skips
Groq transcription for that source; Supabase will reuse the completed transcript
already in Postgres. Response: `202 { jobId, statusUrl, ... }`.

### `GET /jobs/:jobId`

Returns the job with `status` (`queued` | `processing` | `completed` | `failed`)
and, when complete, a `result` containing every extracted frame plus any newly
generated transcripts:

```json
{
  "ok": true,
  "job": {
    "status": "completed",
    "result": {
      "reportId": "8f3c...",
      "frameCount": 9,
      "manifestKey": "reports/8f3c.../manifest.json",
      "frames": [
        {
          "responseId": "a1b2...",
          "frameIndex": 0,
          "timestampMs": 0,
          "storageBucket": "usability-test-screenshots",
          "storageKey": "reports/8f3c.../a1b2.../0000-00000000ms.webp",
          "width": 1280,
          "height": 720,
          "contentType": "image/webp",
          "sizeBytes": 42310,
          "perceptualHash": "ffc3a1..."
        }
      ],
      "transcripts": [
        {
          "responseId": "a1b2...",
          "provider": "groq",
          "model": "whisper-large-v3-turbo",
          "language": "en",
          "durationMs": 42130,
          "fullText": "I opened the app and the signup button was hard to find.",
          "segments": [
            {
              "segmentIndex": 0,
              "startMs": 1200,
              "endMs": 4860,
              "text": "I opened the app and the signup button was hard to find.",
              "words": [{ "word": "I", "startMs": 1200, "endMs": 1280 }]
            }
          ]
        }
      ]
    }
  }
}
```

### `GET /healthz`

Liveness probe.
