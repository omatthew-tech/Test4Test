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
  /** True when Supabase already has a completed transcript for this response/model. */
  transcriptCached?: boolean;
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

export interface ProcessReportHooks {
  onFrame?: (frame: ExtractedFrame) => void | Promise<void>;
}

export interface TranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  words?: TranscriptWord[];
  avgLogprob?: number | null;
  noSpeechProb?: number | null;
  compressionRatio?: number | null;
}

export interface ResponseTranscript {
  responseId: string;
  provider: string;
  model: string;
  language?: string | null;
  durationMs?: number | null;
  fullText: string;
  segments: TranscriptSegment[];
}

export interface ProcessReportResult {
  reportId: string;
  frameCount: number;
  sourceCount: number;
  frames: ExtractedFrame[];
  transcripts: ResponseTranscript[];
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
  partialFrames?: ExtractedFrame[];
  result?: ProcessReportResult;
  error?: string;
}

export interface RecordingThumbnailSource {
  recordingUploadId: string;
  responseId?: string;
  objectKey: string;
  bucket?: string;
  /** Optional short-lived source URL for legacy R2 recordings without an upload row. */
  url?: string;
  /** Trusted source duration avoids scanning large MediaRecorder files. */
  durationSeconds?: number;
  generationVersion: string;
}

export interface RecordingThumbnailResult {
  recordingUploadId: string;
  responseId?: string;
  recordingObjectKey: string;
  storageBucket: string;
  storageKey: string;
  contentType: "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  timestampMs: number;
  durationMs: number;
  generationVersion: string;
}

export interface RecordingThumbnailFailure {
  recordingUploadId: string;
  recordingObjectKey: string;
  error: string;
}

export interface ProcessRecordingThumbnailsInput {
  sources: RecordingThumbnailSource[];
}

export interface ProcessRecordingThumbnailsResult {
  successes: RecordingThumbnailResult[];
  failures: RecordingThumbnailFailure[];
}

export interface RecordingThumbnailJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  sourceCount: number;
  result?: ProcessRecordingThumbnailsResult;
  error?: string;
}
