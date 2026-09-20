import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Dialog, Stack, Surface, Table } from "@test4test/design-system";
import { manageEarnExperiment, type EarnExperimentReport } from "../lib/earnExperiment";
import { EARN_ENTRY_SOURCES, type EarnEntrySource } from "../lib/earnExperimentVisits";
import { formatDateTime } from "../lib/format";
import styles from "./AdminEarnExperiment.module.css";

const sourceLabels: Record<EarnEntrySource, string> = {
  feedback_email: "Feedback email",
  test_back_email: "Test-back reminder email",
  other_email: "Other tagged email",
  normal_sign_in: "Normal sign-in",
  signup_onboarding: "Signup / onboarding",
  shared_link: "Shared link",
  external_referral: "External referral",
  direct_or_unknown: "Direct / unknown",
};
export function formatCompletionTime(seconds: number | null) {
  if (seconds === null) return "--";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

export function AdminEarnExperiment({ fixture = false }: { fixture?: boolean }) {
  const [report, setReport] = useState<EarnExperimentReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (fixture) {
        const { earnExperimentFixture } = await import("../testing/earnExperimentFixture");
        setReport(earnExperimentFixture);
      } else setReport(await manageEarnExperiment());
    } catch (failure) {
      setReport(null);
      setError(
        failure instanceof Error ? failure.message : "Experiment results could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, [fixture]);
  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (action: "start" | "pause" | "end") => {
    setBusy(true);
    setError("");
    try {
      if (fixture)
        setReport(
          (current) =>
            current && {
              ...current,
              status: action === "start" ? "running" : action === "pause" ? "paused" : "ended",
            },
        );
      else setReport(await manageEarnExperiment(action));
      setConfirmEnd(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The experiment could not be updated.");
    } finally {
      setBusy(false);
    }
  };
  const a = report?.variants.find((row) => row.variant === "A");
  const b = report?.variants.find((row) => row.variant === "B");
  const difference =
    a?.completionPercent != null && b?.completionPercent != null
      ? a.completionPercent - b.completionPercent
      : null;

  return (
    <Surface as="section" aria-labelledby="earn-experiment-title" className={styles.panel}>
      <Stack>
        <h2 id="earn-experiment-title">Earn first-test experiment</h2>
        <p>Compare automatic listing with the original first-test requirement.</p>
        {error ? (
          <Alert tone="warning" title="Experiment unavailable">
            {error}
          </Alert>
        ) : null}
        <div className={styles.controls}>
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            Refresh results
          </Button>
          {report?.status === "draft" || report?.status === "paused" ? (
            <Button disabled={busy} onClick={() => void changeStatus("start")}>
              {report.status === "paused" ? "Resume enrollment" : "Start experiment"}
            </Button>
          ) : null}
          {report?.status === "running" ? (
            <Button variant="secondary" disabled={busy} onClick={() => void changeStatus("pause")}>
              Pause enrollment
            </Button>
          ) : null}
          {report && ["running", "paused"].includes(report.status) ? (
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmEnd(true)}>
              End experiment
            </Button>
          ) : null}
        </div>
        {busy ? <p role="status">Loading experiment results...</p> : null}
        {report && a && b ? (
          <>
            <p>
              <strong>Status: {report.status === "draft" ? "Not started" : report.status}</strong>
              {report.startedAt
                ? ` · Started ${formatDateTime(report.startedAt)}`
                : " · Enrollment is disabled."}
              {report.endedAt ? ` · Ended ${formatDateTime(report.endedAt)}` : ""}
            </p>
            <p>
              A: Listed immediately, numeric rank, welcome message. B: Hidden until a credited test,
              with “Complete a test” and no welcome message.
            </p>
            <Table
              caption="First credited test completion by version"
              headers={["Metric", "A — Current", "B — Original"]}
              rows={[
                ["Assigned users", a.assigned, b.assigned],
                ["Saw Earn", a.exposed, b.exposed],
                ["Assigned, not exposed", a.unexposed, b.unexposed],
                ["First credited completions", a.completed, b.completed],
                [
                  "Completion rate",
                  a.completionPercent === null ? "--" : `${a.completionPercent}%`,
                  b.completionPercent === null ? "--" : `${b.completionPercent}%`,
                ],
                ["Not yet completed", a.notCompleted, b.notCompleted],
                [
                  "Median time to completion",
                  formatCompletionTime(a.medianSeconds),
                  formatCompletionTime(b.medianSeconds),
                ],
              ]}
            />
            <p>
              {difference === null
                ? "A rate difference will appear after both versions have exposed users."
                : `A minus B: ${difference > 0 ? "+" : ""}${difference.toFixed(2)} percentage points.`}
            </p>
            <p>
              Cumulative results as of {formatDateTime(report.asOf)}. Users have different
              observation times. Rates include users who saw Earn before their first credited test;
              median times include completers only.
            </p>
            {(["exposure", "completion"] as const).map((stage) => (
              <Table
                key={stage}
                caption={
                  stage === "exposure"
                    ? "Arrival source at first Earn view"
                    : "Arrival source on the completion visit"
                }
                headers={["Source", "A — Current", "B — Original"]}
                rows={EARN_ENTRY_SOURCES.map((source) => [
                  sourceLabels[source],
                  report.sources.find(
                    (row) => row.stage === stage && row.source === source && row.variant === "A",
                  )?.users ?? 0,
                  report.sources.find(
                    (row) => row.stage === stage && row.source === source && row.variant === "B",
                  )?.users ?? 0,
                ])}
              />
            ))}
            <p>
              Email sources identify visits from tagged links. Older untagged links and unavailable
              attribution appear under Direct / unknown.
            </p>
          </>
        ) : null}
      </Stack>
      <Dialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End the Earn experiment?"
        description="This restores automatic listing for everyone and freezes the results. This experiment cannot be restarted."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmEnd(false)}>
              Keep running
            </Button>
            <Button disabled={busy} onClick={() => void changeStatus("end")}>
              End and freeze results
            </Button>
          </>
        }
      >
        <p>Use Pause enrollment if you want to keep measuring the users already assigned.</p>
      </Dialog>
    </Surface>
  );
}
