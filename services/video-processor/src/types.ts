/** A single source recording to process for a report. */
export interface VideoSource {
  /** The test_responses.id this recording belongs to (used in the output key). */
  responseId: string;
  /** R2 object key of the source video. Mutually exclusive with `url`. */
  objectKey?: string;
  /** Pre-signed/public URL to download the source video. Overrides `objectKey`. */
  url?: string;
  /** Optional source bucket override (defaults to config.r2.sourceBucketName). */
  bucket?: string;
}

/** Metadata describing one extracted, uploaded screenshot. */
export interface ExtractedFrame {
  responseId: string;
  /** Zero-based order of this frame within its source video. */
  frameIndex: number;
  /** EXACT offset of this screenshot within the source video, in milliseconds. */
  timestampMs: number;
  /** Bucket the frame was written to. */
  storageBucket: string;
  /** Object key of the frame in R2. */
  storageKey: string;
  width: number;
  height: number;
  contentType: string;
  sizeBytes: number;
  /** Perceptual (average) hash used for de-duplication. */
  perceptualHash: string;
}

export interface ProcessReportInput {
  /** usability_reports.id this job is producing frames for. */
  reportId: string;
  sources: VideoSource[];
}

export interface ProcessReportResult {
  reportId: string;
  frameCount: number;
  sourceCount: number;
  frames: ExtractedFrame[];
  /** R2 key of the JSON manifest written for this report. */
  manifestKey: string;
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  reportId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: ProcessReportResult;
  error?: string;
}
