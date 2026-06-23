# video-processor

Asynchronous Node.js worker that turns usability-test screen recordings into a
set of **unique, timestamped app-page screenshots** stored in Cloudflare R2.

It exists as a standalone service because the rest of the Test4Test backend runs
on Supabase Edge Functions (Deno), which cannot run `ffmpeg`. This worker does
the heavy video processing and writes results back to R2 (and, optionally, to a
completion webhook that persists references in Postgres).

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
cp .env.example .env   # fill in Cloudflare R2 credentials
npm install
npm run dev            # or: npm run build && npm start
```

`ffmpeg`/`ffprobe` binaries are provided by the `ffmpeg-static` /
`ffprobe-static` dependencies — no system install required.

## Configuration

All R2 credentials are read **strictly from environment variables** (see
`src/config.ts`); nothing is hardcoded. Required:

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `CLOUDFLARE_ACCESS_KEY_ID` | R2 access key id |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | R2 secret access key |
| `CLOUDFLARE_BUCKET_NAME` | Destination bucket for generated frames |
| `CLOUDFLARE_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |

Optional: `CLOUDFLARE_SOURCE_BUCKET_NAME`, `PORT`, `WORKER_SHARED_SECRET`,
`JOB_CONCURRENCY`, `COMPLETION_WEBHOOK_URL`, and the `FRAME_*` tuning knobs.

## API

### `POST /reports/process`

Headers: `x-worker-secret: <WORKER_SHARED_SECRET>` (when configured).

```json
{
  "reportId": "8f3c...",
  "sources": [
    { "responseId": "a1b2...", "objectKey": "draft/<user>/<session>/rec.webm" },
    { "responseId": "c3d4...", "url": "https://signed-url-to-video" }
  ]
}
```

Each source needs `responseId` plus either `objectKey` (downloaded from R2) or
`url` (downloaded directly). Response: `202 { jobId, statusUrl, ... }`.

### `GET /jobs/:jobId`

Returns the job with `status` (`queued` | `processing` | `completed` | `failed`)
and, when complete, a `result` containing every extracted frame:

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
          "storageBucket": "usability-report-frames",
          "storageKey": "reports/8f3c.../a1b2.../0000-00000000ms.webp",
          "width": 1280,
          "height": 720,
          "contentType": "image/webp",
          "sizeBytes": 42310,
          "perceptualHash": "ffc3a1..."
        }
      ]
    }
  }
}
```

### `GET /healthz`

Liveness probe.
