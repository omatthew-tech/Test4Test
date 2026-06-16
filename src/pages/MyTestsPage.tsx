import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Inbox, Share2 } from "lucide-react";
import { EditSubmissionModal } from "../components/EditSubmissionModal";
import { ShareTestModal } from "../components/ShareTestModal";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDate } from "../lib/format";
import { getActiveQuestionSet, getMySubmissions } from "../lib/selectors";
import { buildReadableShareUrl, buildShareUrlFromSlug } from "../lib/shareLinks";
import { Submission, SubmissionStatus } from "../types";

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

async function copyTextToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

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

  const openEditTest = (submission: Submission) => {
    setEditingSubmissionId(submission.id);
  };

  useEffect(() => {
    if (!editSubmissionId || editingSubmissionId === editSubmissionId) {
      return;
    }

    const submission = submissions.find((item) => item.id === editSubmissionId);

    if (!submission) {
      return;
    }

    const nextParams = new URLSearchParams(searchParamsKey);
    nextParams.delete("edit");
    setEditingSubmissionId(submission.id);
    setSearchParams(nextParams, { replace: true });
  }, [
    editingSubmissionId,
    editSubmissionId,
    searchParamsKey,
    setSearchParams,
    submissions,
  ]);

  const closeEditTest = () => {
    setEditingSubmissionId(null);
  };

  const openShareTest = (submission: Submission) => {
    if (submission.status !== "live") {
      return;
    }

    setSharingSubmissionId(submission.id);
    setShareCopyStatus("");
  };

  const closeShareTest = () => {
    setSharingSubmissionId(null);
    setShareCopyStatus("");
  };

  const saveShareMessage = async (customMessage: string) => {
    if (!sharingSubmission) {
      return null;
    }

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
    <AppShell title="My Apps" eyebrowLabel={null}>
      <div className="page-stack my-tests-page">
        {submissions.length === 0 ? (
          <Surface>
            <div className="empty-state">
              <Inbox size={24} />
              <h3>No submissions yet</h3>
              <p>Publish a product first, verify your email, and your results will start filling up as feedback comes in.</p>
              <Link to="/submit" className="button button--primary">Submit your app</Link>
            </div>
          </Surface>
        ) : (
          <div className="my-tests-list">
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
                <Surface key={submission.id} className={`my-test-row my-test-row--${submission.status}`}>
                  <div className="my-test-row__header">
                    <div className="my-test-row__identity">
                      <span className={`my-test-status my-test-status--${submission.status}`}>
                        <span className="my-test-status__dot" />
                        {submissionStatusLabel(submission.status)}
                      </span>
                      <h3>{submission.productName}</h3>
                    </div>
                    <small className="my-test-row__date">Submitted {formatDate(submission.createdAt)}</small>
                  </div>

                  {submission.description ? (
                    <p className="my-test-row__description">{submission.description}</p>
                  ) : null}

                  {submission.needsGooglePlayClosedTesters ? (
                    <div className="google-play-owner-progress">
                      <span className="eyebrow">Google Play closed-test participants</span>
                      <div className="google-play-owner-progress__metrics">
                        <span><strong>{activeClosedTestCount}</strong> active</span>
                        <span><strong>{completedClosedTestCount}</strong> completed</span>
                        <span><strong>{missedClosedTestCount}</strong> missed</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="my-test-row__footer">
                    <div className="my-test-row__meta">
                      <div className="my-test-row__metric">
                        <strong>{submission.responseCount}</strong>
                        <span>{submission.responseCount === 1 ? "response" : "responses"}</span>
                      </div>

                      {submission.lastResponseAt ? (
                        <span className="my-test-row__latest">Latest feedback {formatDate(submission.lastResponseAt)}</span>
                      ) : null}
                      {submission.needsGooglePlayClosedTesters ? (
                        <span className="tag tag--warm">Google Play closed test</span>
                      ) : null}
                    </div>

                    <div className="my-test-row__actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditTest(submission)}
                      >
                        Edit app
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openShareTest(submission)}
                        disabled={submission.status !== "live"}
                      >
                        Share test
                        <Share2 size={16} />
                      </button>
                      <Link to={`/my-tests/${submission.id}`} className="button button--primary">
                        View results
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </div>

      {sharingSubmission ? (
        <ShareTestModal
          submission={sharingSubmission}
          questionSet={sharingQuestionSet}
          shareUrl={sharingUrl}
          copyStatus={shareCopyStatus}
          onCopy={copyShareUrl}
          onSaveMessage={saveShareMessage}
          onClose={closeShareTest}
        />
      ) : null}

      {editingSubmission ? (
        <EditSubmissionModal
          submission={editingSubmission}
          onClose={closeEditTest}
          onSave={updateSubmissionDetails}
        />
      ) : null}
    </AppShell>
  );
}
