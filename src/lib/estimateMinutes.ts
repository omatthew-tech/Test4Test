import type { Question } from "../types";

export const RECORDING_TEST_MINUTES_OVERHEAD = 4;

export function estimateMinutes(questions: Question[]) {
  const paragraphCount = questions.filter((question) => question.type === "paragraph").length;
  const multipleCount = questions.length - paragraphCount;
  return Math.max(3, Math.round(paragraphCount * 1.2 + multipleCount * 0.35 + 1));
}

export function estimateSubmissionMinutes(questions: Question[], requiresRecording = false) {
  const baseMinutes = estimateMinutes(questions);
  return requiresRecording ? baseMinutes + RECORDING_TEST_MINUTES_OVERHEAD : baseMinutes;
}
