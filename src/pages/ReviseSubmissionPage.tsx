import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Dialog, Link, Stack, Surface, Textarea } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { loadSubmittedFeedbackCards } from "../lib/submittedFeedback";
import { loadResponseVersions } from "../lib/responseVersions";
import { reportFeedbackRating } from "../lib/reportFeedbackRating";
import {
  loadReportedFeedbackResponseIds,
  markReportedFeedbackResponseId,
} from "../lib/reportedFeedback";
import { TestSessionPage } from "./TestSessionPage";

export function ReviseSubmissionPage() {
  const { responseId = "" } = useParams();
  const { state, currentUser } = useAppState();
  const response = state.responses.find(
    (item) => item.id === responseId && item.testerUserId === currentUser?.id,
  );
  const submission = state.submissions.find((item) => item.id === response?.submissionId);
  const [eligibility, setEligibility] = useState<{
    version: number;
    allowed: boolean;
    canReport: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!response || !submission || !currentUser) return;
    let cancelled = false;
    setEligibility(null);
    setError("");
    const fixture = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
    void Promise.all([
      loadResponseVersions(response),
      fixture ? Promise.resolve(null) : loadSubmittedFeedbackCards(),
    ])
      .then(([versions, cards]) => {
        if (cancelled) return;
        if (!versions.length) throw new Error("Recording history is unavailable.");
        const card = cards?.find((item) => item.responseId === responseId);
        const rating = fixture
          ? state.feedbackRatings.find((item) => item.testResponseId === responseId)?.ratingValue
          : card?.ratingValue;
        const pending = card?.reportStatus
          ? card.reportStatus === "pending"
          : loadReportedFeedbackResponseIds(currentUser.id).includes(responseId);
        const canReport = (rating === "neutral" || rating === "frowny") && !pending;
        setEligibility({
          version: versions[0]?.versionNumber ?? 1,
          allowed: submission.status === "live" && canReport,
          canReport,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Feedback could not be loaded. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [response, submission, currentUser, responseId, state.feedbackRatings, retry]);

  async function sendReport() {
    setReporting(true);
    setReportError("");
    try {
      await reportFeedbackRating(responseId, reportMessage.trim());
      if (currentUser) markReportedFeedbackResponseId(currentUser.id, responseId);
      setReportOpen(false);
      setRetry((value) => value + 1);
    } catch (cause) {
      setReportError(cause instanceof Error ? cause.message : "Your report could not be sent.");
    } finally {
      setReporting(false);
    }
  }

  const reportAction = eligibility?.canReport ? (
    <Button variant="secondary" onClick={() => setReportOpen(true)}>
      Report Rating
    </Button>
  ) : null;
  return (
    <>
      {response && submission && eligibility?.allowed ? (
        <TestSessionPage
          key={`${response.id}:${eligibility.version}`}
          revision={{
            responseId,
            submissionId: submission.id,
            expectedVersionNumber: eligibility.version,
          }}
          revisionActions={reportAction}
        />
      ) : (
        <AppShell title="Revise feedback" eyebrowLabel={null}>
          <Surface>
            <Stack gap="md">
              <p>
                {!response
                  ? "That submitted test could not be found."
                  : error ||
                    (!eligibility
                      ? "Loading feedback…"
                      : "This feedback is not currently eligible for revision. The test must be live, rated neutral or unhelpful, and have no pending rating dispute.")}
              </p>
              {error ? (
                <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
              ) : null}
              {reportAction}
              <Link to="/submissions">Back to submitted tests</Link>
            </Stack>
          </Surface>
        </AppShell>
      )}
      <Dialog
        open={reportOpen}
        onOpenChange={(open) => {
          if (!reporting) setReportOpen(open);
        }}
        title="Report rating"
      >
        <Stack gap="md">
          <Textarea
            label="Explain your report"
            value={reportMessage}
            onChange={(event) => setReportMessage(event.target.value)}
            maxLength={280}
          />
          {reportError ? <Alert tone="danger">{reportError}</Alert> : null}
          <Button
            loading={reporting}
            disabled={!reportMessage.trim()}
            onClick={() => void sendReport()}
          >
            Submit report
          </Button>
        </Stack>
      </Dialog>
    </>
  );
}
