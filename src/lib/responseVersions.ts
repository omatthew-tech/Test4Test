import type { ResponseRecording, TestAnswer, TestResponse } from "../types";
import { requireSupabase } from "./supabase";

export interface TestResponseVersion {
  id: string;
  responseId: string;
  versionNumber: number;
  submittedAt: string;
  durationSeconds: number;
  answers: TestAnswer[];
  recording: ResponseRecording | null;
}

export function recordingVersionLabel(versionNumber: number) {
  return versionNumber === 1 ? "Original" : `Revision ${versionNumber - 1}`;
}

export function initialResponseVersion(response: TestResponse): TestResponseVersion {
  return {
    id: `${response.id}-original`,
    responseId: response.id,
    versionNumber: 1,
    submittedAt: response.submittedAt,
    durationSeconds: response.durationSeconds,
    answers: response.answers,
    recording: response.recording,
  };
}

export async function loadResponseVersions(response: TestResponse): Promise<TestResponseVersion[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") {
    const original = initialResponseVersion(response);
    return new URLSearchParams(window.location.search).get("ds-recording-history") === "1"
      ? [{ ...original, id: `${response.id}-revision-1`, versionNumber: 2, answers: [] }, original]
      : [original];
  }
  const { data, error } = await requireSupabase()
    .from("test_response_versions")
    .select("*")
    .eq("response_id", response.id)
    .order("version_number", { ascending: false });
  if (error) throw new Error("Recording history could not be loaded. Try again.");
  return (data ?? []).map((row) => ({
    id: row.id,
    responseId: row.response_id,
    versionNumber: row.version_number,
    submittedAt: row.submitted_at,
    durationSeconds: row.duration_seconds,
    answers: row.answers ?? [],
    recording:
      row.recording_bucket && row.recording_path
        ? {
            bucket: row.recording_bucket,
            path: row.recording_path,
            fileName: row.recording_file_name ?? "screen-recording.webm",
            mimeType: row.recording_mime_type ?? "video/webm",
            fileSizeBytes: row.recording_file_size_bytes ?? 0,
            uploadedAt: row.recording_uploaded_at ?? row.submitted_at,
            expiresAt: null,
            deletedAt: row.recording_deleted_at,
          }
        : null,
  }));
}
