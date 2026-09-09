import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import type { AppState } from "../types";
import type { TranscriptReportData, TranscriptStatus } from "../lib/transcriptReport";

export function buildTranscriptReportFixtures(state: AppState, scenario: string | null) {
  const reports = new Map<string, TranscriptReportData>();
  for (const { submission, response } of getAvailableRecordingsForCurrentUser(state)) {
    let report = reports.get(submission.id);
    if (!report) {
      report = {
        app: {
          id: submission.id,
          productName: submission.productName,
          description: submission.description,
          targetAudience: submission.targetAudience,
          instructionSteps: submission.instructionSteps.length
            ? submission.instructionSteps
            : [submission.instructions].filter(Boolean),
          latestRecordingAt: response.submittedAt,
        },
        recordings: [],
      };
      reports.set(submission.id, report);
    }
    const index = report.recordings.length;
    const text =
      index === 0
        ? "I expected the save button to be next to the palette. It took me a moment to find it."
        : "The colors are easy to compare. I would like to share this palette with my team.";
    const status: TranscriptStatus =
      scenario === "pending"
        ? "pending"
        : scenario === "failed" || (scenario === "partial" && index === 1)
          ? "failed"
          : "ready";
    report.recordings.push({
      responseId: response.id,
      submittedAt: response.submittedAt,
      durationMs: response.durationSeconds * 1000,
      status,
      language: "en",
      fullText:
        scenario === "silent"
          ? ""
          : scenario === "long"
            ? Array.from({ length: 100 }, () => text).join("\n")
            : text,
      segments: ["silent", "untimed", "long"].includes(scenario ?? "")
        ? []
        : [{ startMs: 12340, endMs: 18720, text }],
    });
  }
  if (scenario === "multi" && reports.size) {
    const other = structuredClone([...reports.values()][0]);
    other.app = {
      ...other.app,
      id: "submission-report-second-app",
      productName: "Palette Pilot Beta",
      description: "A separate app with its own recordings.",
    };
    other.recordings = other.recordings.slice(0, 1).map((recording) => ({
      ...recording,
      responseId: "response-report-second-app",
      fullText: "This is feedback for the beta app.",
      segments: [],
    }));
    reports.set(other.app.id, other);
  }
  return reports;
}
