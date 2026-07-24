import { ArrowRight, Inbox, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Cluster,
  EmptyState,
  Stack,
  StatusIndicator,
  TechnicalValue,
} from "@test4test/design-system";
import { EditSubmissionModal } from "../components/EditSubmissionModal";
import { ShareTestModal } from "../components/ShareTestModal";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDate } from "../lib/format";
import { getActiveQuestionSet, getMySubmissions } from "../lib/selectors";
import { buildReadableShareUrl, buildShareUrlFromSlug } from "../lib/shareLinks";
import type { Submission, SubmissionStatus } from "../types";
import styles from "./MyTestsPage.module.css";

function submissionStatusLabel(status: SubmissionStatus) {
  switch (status) {
    case "live":
      return "Live";
    case "pending_verification":
      return "Awaiting verification";
    case "paused":
      return "Paused";
    case "flagged":
      return "Needs review";
    default:
      return "Draft";
  }
}

function submissionStatusTone(status: SubmissionStatus) {
  switch (status) {
    case "live":
      return "success" as const;
    case "pending_verification":
      return "warning" as const;
    case "flagged":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

async function copyTextToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function MyTestsPage() {
  const { state, updateSubmissionDetails, upsertSubmissionShareLink } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const submissions = getMySubmissions(state);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [sharingSubmissionId, setSharingSubmissionId] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState("");

  const sharingSubmission = useMemo(
    () => submissions.find((submission) => submission.id === sharingSubmissionId) ?? null,
    [sharingSubmissionId, submissions],
  );
  const editingSubmission = useMemo(
    () => submissions.find((submission) => submission.id === editingSubmissionId) ?? null,
    [editingSubmissionId, submissions],
  );
  const sharingQuestionSet = sharingSubmission
    ? getActiveQuestionSet(state, sharingSubmission.id)
    : null;
  const sharingUrl = sharingSubmission ? buildReadableShareUrl(sharingSubmission) : "";
  const editSubmissionId = searchParams.get("edit");
  const searchParamsKey = searchParams.toString();
  const closedTestParticipationsBySubmissionId = useMemo(() => {
    const grouped = new Map<string, typeof state.googlePlayClosedTestParticipations>();
    state.googlePlayClosedTestParticipations.forEach((participation) => {
      const current = grouped.get(participation.submissionId) ?? [];
      grouped.set(participation.submissionId, [...current, participation]);
    });
    return grouped;
  }, [state.googlePlayClosedTestParticipations]);

  useEffect(() => {
    if (!editSubmissionId || editingSubmissionId === editSubmissionId) return;
    const submission = submissions.find((item) => item.id === editSubmissionId);
    if (!submission) return;
    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete("edit");
    setEditingSubmissionId(submission.id);
    setSearchParams(nextParams, { replace: true });
  }, [editingSubmissionId, editSubmissionId, searchParamsKey, setSearchParams, submissions]);

  const openShareTest = (submission: Submission) => {
    if (submission.status !== "live") return;
    setSharingSubmissionId(submission.id);
    setShareCopyStatus("");
  };

  const closeShareTest = () => {
    setSharingSubmissionId(null);
    setShareCopyStatus("");
  };

  const saveShareMessage = async (customMessage: string) => {
    if (!sharingSubmission) return null;
    try {
      const { slug } = await upsertSubmissionShareLink(sharingSubmission.id, customMessage);
      return buildShareUrlFromSlug(slug);
    } catch {
      return null;
    }
  };

  const copyShareUrl = async (customMessage: string) => {
    setShareCopyStatus("Copying...");
    try {
      const shareUrlToCopy = await saveShareMessage(customMessage);
      if (!shareUrlToCopy) {
        setShareCopyStatus("Copy failed");
        return null;
      }
      const copied = await copyTextToClipboard(shareUrlToCopy);
      setShareCopyStatus(copied ? "Copied" : "Copy failed");
      return copied ? shareUrlToCopy : null;
    } catch {
      setShareCopyStatus("Copy failed");
      return null;
    }
  };

  return (
    <AppShell
      title="My tests"
      description="Review active tests and the feedback testers submitted."
      eyebrowLabel={null}
      actions={
        <RouterLink className={styles.primaryLink} to="/submit">
          Submit a test
        </RouterLink>
      }
    >
      {submissions.length === 0 ? (
        <EmptyState
          icon={<Inbox size={24} />}
          title="No submissions yet"
          description="Publish a product first, verify your email, and your results will start filling up as feedback comes in."
          action={
            <RouterLink className={styles.primaryLink} to="/submit">
              Submit your app
            </RouterLink>
          }
        />
      ) : (
        <div className={styles.list}>
          {submissions.map((submission) => {
            const closedTestParticipations =
              closedTestParticipationsBySubmissionId.get(submission.id) ?? [];
            const activeClosedTestCount = closedTestParticipations.filter(
              (participation) => participation.status === "active",
            ).length;
            const completedClosedTestCount = closedTestParticipations.filter(
              (participation) => participation.status === "completed",
            ).length;
            const missedClosedTestCount = closedTestParticipations.filter(
              (participation) => participation.status === "missed",
            ).length;

            return (
              <Card as="article" className={styles.testCard} key={submission.id}>
                <div className={styles.header}>
                  <Stack gap="sm">
                    <Cluster>
                      <StatusIndicator tone={submissionStatusTone(submission.status)}>
                        {submissionStatusLabel(submission.status)}
                      </StatusIndicator>
                      {submission.needsGooglePlayClosedTesters && (
                        <Badge>Google Play closed test</Badge>
                      )}
                    </Cluster>
                    <h2>{submission.productName}</h2>
                    <span className={styles.date}>
                      Submitted {formatDate(submission.createdAt)}
                    </span>
                  </Stack>
                  <div className={styles.responseMetric}>
                    <TechnicalValue as="strong">{submission.responseCount}</TechnicalValue>
                    <span>{submission.responseCount === 1 ? "response" : "responses"}</span>
                  </div>
                </div>

                {submission.description && (
                  <p className={styles.description}>{submission.description}</p>
                )}

                {submission.needsGooglePlayClosedTesters && (
                  <div className={styles.closedTestProgress}>
                    <strong>Google Play closed-test participants</strong>
                    <Cluster>
                      <span>
                        <b>{activeClosedTestCount}</b> active
                      </span>
                      <span>
                        <b>{completedClosedTestCount}</b> completed
                      </span>
                      <span>
                        <b>{missedClosedTestCount}</b> missed
                      </span>
                    </Cluster>
                  </div>
                )}

                <div className={styles.footer}>
                  <div className={styles.latest}>
                    {submission.lastResponseAt
                      ? `Latest feedback ${formatDate(submission.lastResponseAt)}`
                      : "No feedback yet"}
                  </div>
                  <Cluster>
                    <Button
                      variant="secondary"
                      onClick={() => setEditingSubmissionId(submission.id)}
                    >
                      Edit app
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => openShareTest(submission)}
                      disabled={submission.status !== "live"}
                    >
                      Share test
                      <Share2 aria-hidden="true" size={16} />
                    </Button>
                    <RouterLink className={styles.primaryLink} to={`/my-tests/${submission.id}`}>
                      View results
                      <ArrowRight aria-hidden="true" size={16} />
                    </RouterLink>
                  </Cluster>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {sharingSubmission && (
        <ShareTestModal
          submission={sharingSubmission}
          questionSet={sharingQuestionSet}
          shareUrl={sharingUrl}
          copyStatus={shareCopyStatus}
          onCopy={copyShareUrl}
          onSaveMessage={saveShareMessage}
          onClose={closeShareTest}
        />
      )}

      {editingSubmission && (
        <EditSubmissionModal
          submission={editingSubmission}
          onClose={() => setEditingSubmissionId(null)}
          onSave={updateSubmissionDetails}
        />
      )}
    </AppShell>
  );
}
