export type NewFeedbackSource = "earn" | "shared_link";

export function testFeedbackSource(
  sharedVisit: boolean,
  search: URLSearchParams,
  recoveredSource?: NewFeedbackSource,
): NewFeedbackSource {
  // A shared slug / explicit shared URL always stays free, including signed-in visits.
  if (sharedVisit) return "shared_link";
  if (recoveredSource) return recoveredSource;
  return search.get("feedback_source") === "earn" ? "earn" : "shared_link";
}

export function earnTestHref(submissionId: string) {
  return `/test/${encodeURIComponent(submissionId)}?feedback_source=earn`;
}
