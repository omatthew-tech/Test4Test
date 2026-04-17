import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  HandCoins,
  ExternalLink,
  MessageSquareQuote,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AutoResizeTextarea } from "../components/AutoResizeTextarea";
import { AppShell, Surface } from "../components/Layout";
import { ReactionFaces } from "../components/ReactionFaces";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime, getOrderedAccessLinks } from "../lib/format";
import {
  buildAiQuestions,
  buildGeneralQuestions,
  defaultCustomQuestions,
} from "../lib/questions";
import {
  buildSubmissionSummary,
  getActiveQuestionSet,
  getActiveSubmissionVersion,
  getResponseRating,
  getSubmissionResponses,
  getSubmissionResponsesForSubmissionVersion,
  getSubmissionVersions,
} from "../lib/selectors";
import { requestResponseRecordingUrl } from "../lib/recordings";
import { requireSupabase } from "../lib/supabase";
import { PaymentMethods, Question, QuestionMode } from "../types";

type ResponseViewMode = "all" | "individual";
type TipMethodKey = "paypalHandle" | "venmoHandle" | "cashAppHandle";

interface TipProfile extends PaymentMethods {
  anonymousLabel: string;
}

const defaultVersionDescription = "Describe any updates you've made to your app here";

const tipMethodConfigs: Array<{ key: TipMethodKey; label: string }> = [
  { key: "paypalHandle", label: "PayPal" },
  { key: "venmoHandle", label: "Venmo" },
  { key: "cashAppHandle", label: "Cash App" },
];

function getTipHref(key: TipMethodKey, value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  switch (key) {
    case "paypalHandle": {
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }

      if (/paypal\.me\//i.test(trimmed)) {
        return `https://${trimmed.replace(/^https?:\/\//i, "")}`;
      }

      return null;
    }
    case "venmoHandle":
      return `https://account.venmo.com/u/${encodeURIComponent(trimmed.replace(/^@/, ""))}`;
    case "cashAppHandle":
      return `https://cash.app/$${encodeURIComponent(trimmed.replace(/^\$/, ""))}`;
    default:
      return null;
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

function formatRecordingSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

export function SubmissionDetailPage() {
  const { submissionId = "" } = useParams();
  const {
    state,
    currentUser,
    createSubmissionVersion,
    deleteSubmissionVersion,
    rateFeedback,
    updateQuestionSet,
  } = useAppState();
  const submission = state.submissions.find((item) => item.id === submissionId);
  const accessLinks = useMemo(
    () => (submission ? getOrderedAccessLinks(submission.accessLinks, submission.productTypes) : []),
    [submission],
  );
  const submissionVersions = useMemo(
    () => (submission ? getSubmissionVersions(state, submission.id) : []),
    [state, submission],
  );
  const activeSubmissionVersion = submission ? getActiveSubmissionVersion(state, submission.id) : null;
  const activeQuestionSet = submission ? getActiveQuestionSet(state, submission.id) : null;
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [responseView, setResponseView] = useState<ResponseViewMode>("all");
  const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);
  const [editMode, setEditMode] = useState<QuestionMode>(submission?.questionMode ?? "general");
  const [editQuestions, setEditQuestions] = useState<Question[]>(activeQuestionSet?.questions ?? []);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [showVersionCreator, setShowVersionCreator] = useState(false);
  const [nextVersionTitle, setNextVersionTitle] = useState("");
  const [nextVersionDescription, setNextVersionDescription] = useState("");
  const [versionCreateError, setVersionCreateError] = useState("");
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [showVersionDeleteConfirm, setShowVersionDeleteConfirm] = useState(false);
  const [versionPendingDeleteId, setVersionPendingDeleteId] = useState<string | null>(null);
  const [versionDeleteError, setVersionDeleteError] = useState("");
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  const [showTipPanel, setShowTipPanel] = useState(false);
  const [isLoadingTipProfile, setIsLoadingTipProfile] = useState(false);
  const [tipProfile, setTipProfile] = useState<TipProfile | null>(null);
  const [tipProfileResponseId, setTipProfileResponseId] = useState<string | null>(null);
  const [tipError, setTipError] = useState("");
  const [copiedTipMethod, setCopiedTipMethod] = useState<TipMethodKey | null>(null);
  const [recordingAction, setRecordingAction] = useState<"watch" | "download" | null>(null);
  const [recordingActionError, setRecordingActionError] = useState("");
  const selectedResponseIdRef = useRef<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  const selectedVersion = useMemo(() => {
    if (submissionVersions.length === 0) {
      return null;
    }

    return (
      submissionVersions.find((version) => version.id === selectedVersionId) ??
      activeSubmissionVersion ??
      submissionVersions[0]
    );
  }, [activeSubmissionVersion, selectedVersionId, submissionVersions]);
  const allResponses = useMemo(
    () => (submission ? getSubmissionResponses(state, submission.id) : []),
    [state, submission],
  );

  const responses = useMemo(
    () =>
      submission && selectedVersion
        ? getSubmissionResponsesForSubmissionVersion(state, submission.id, selectedVersion.id)
        : [],
    [selectedVersion, state, submission],
  );
  const summary = useMemo(
    () => buildSubmissionSummary(state, activeQuestionSet, responses),
    [activeQuestionSet, responses, state],
  );
  const responseCountsByVersion = useMemo(() => {
    const counts = new Map<string, number>();

    if (!submission) {
      return counts;
    }

    state.responses.forEach((response) => {
      if (response.submissionId !== submission.id) {
        return;
      }

      counts.set(
        response.submissionVersionId,
        (counts.get(response.submissionVersionId) ?? 0) + 1,
      );
    });

    return counts;
  }, [state.responses, submission]);
  const versionPendingDelete = useMemo(
    () => submissionVersions.find((version) => version.id === versionPendingDeleteId) ?? null,
    [submissionVersions, versionPendingDeleteId],
  );
  const versionPendingDeleteResponseCount = versionPendingDelete
    ? responseCountsByVersion.get(versionPendingDelete.id) ?? 0
    : 0;
  const latestResponse = allResponses[0] ?? null;
  const nextVersionNumber = submissionVersions.length > 0 ? submissionVersions[0].versionNumber + 1 : 2;

  const savedEditMode: QuestionMode = activeQuestionSet?.mode ?? submission?.questionMode ?? "general";
  const savedEditQuestions = activeQuestionSet?.questions ?? [];

  const openQuestionEditor = () => {
    if (!activeQuestionSet) {
      return;
    }

    if (activeSubmissionVersion) {
      setSelectedVersionId(activeSubmissionVersion.id);
    }
    setEditMode(savedEditMode);
    setEditQuestions(savedEditQuestions);
    setShowQuestionEditor(true);
  };

  const openVersionCreator = () => {
    setVersionCreateError("");
    setNextVersionTitle(`Version ${nextVersionNumber}`);
    setNextVersionDescription("");
    setShowVersionCreator(true);
  };

  const closeVersionCreator = () => {
    if (isCreatingVersion) {
      return;
    }

    setShowVersionCreator(false);
    setVersionCreateError("");
  };

  const openVersionDeleteConfirm = (versionId: string) => {
    if (submissionVersions.length <= 1) {
      return;
    }

    setVersionPendingDeleteId(versionId);
    setVersionDeleteError("");
    setShowVersionDeleteConfirm(true);
  };

  const closeVersionDeleteConfirm = () => {
    if (isDeletingVersion) {
      return;
    }

    setShowVersionDeleteConfirm(false);
    setVersionPendingDeleteId(null);
    setVersionDeleteError("");
  };

  useEffect(() => {
    if (submissionVersions.length === 0) {
      setSelectedVersionId(null);
      return;
    }

    setSelectedVersionId((current) => {
      if (current && submissionVersions.some((version) => version.id === current)) {
        return current;
      }

      return activeSubmissionVersion?.id ?? submissionVersions[0].id;
    });
  }, [activeSubmissionVersion?.id, submissionVersions]);

  useEffect(() => {
    setEditMode(savedEditMode);
    setEditQuestions(savedEditQuestions);
  }, [activeQuestionSet?.id, savedEditMode, savedEditQuestions]);

  useEffect(() => {
    setSelectedResponseIndex(0);
  }, [responses.length, selectedVersion?.id]);

  const selectedResponse = responses[selectedResponseIndex] ?? null;
  const selectedRating = selectedResponse
    ? getResponseRating(state, selectedResponse.id, currentUser?.id ?? null)
    : null;
  const selectedRecording = selectedResponse?.recording ?? null;
  const recordingIsExpired =
    !selectedRecording ||
    Boolean(selectedRecording.deletedAt) ||
    new Date(selectedRecording.expiresAt).getTime() <= Date.now();
  const showRecordingPanel = submission?.requiresRecording === true || Boolean(selectedRecording);

  const handleCreateVersion = async () => {
    if (!submission) {
      return;
    }

    setIsCreatingVersion(true);
    setVersionCreateError("");

    try {
      const versionId = await createSubmissionVersion(
        submission.id,
        nextVersionTitle,
        nextVersionDescription,
      );
      setSelectedVersionId(versionId);
      setResponseView("all");
      setSelectedResponseIndex(0);
      setShowVersionCreator(false);
    } catch (error) {
      setVersionCreateError(
        error instanceof Error ? error.message : "The version could not be created.",
      );
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleDeleteVersion = async () => {
    if (!submission || !versionPendingDelete) {
      return;
    }

    setIsDeletingVersion(true);
    setVersionDeleteError("");

    try {
      const nextVersionId = await deleteSubmissionVersion(submission.id, versionPendingDelete.id);
      setSelectedVersionId(
        selectedVersion?.id === versionPendingDelete.id
          ? nextVersionId
          : selectedVersion?.id ?? nextVersionId,
      );
      setResponseView("all");
      setSelectedResponseIndex(0);
      setShowVersionDeleteConfirm(false);
      setVersionPendingDeleteId(null);
    } catch (error) {
      setVersionDeleteError(
        error instanceof Error ? error.message : "The version could not be deleted.",
      );
    } finally {
      setIsDeletingVersion(false);
    }
  };

  useEffect(() => {
    selectedResponseIdRef.current = selectedResponse?.id ?? null;
  }, [selectedResponse?.id]);

  useEffect(() => {
    setShowTipPanel(false);
    setIsLoadingTipProfile(false);
    setTipProfile(null);
    setTipProfileResponseId(null);
    setTipError("");
    setCopiedTipMethod(null);
    setRecordingAction(null);
    setRecordingActionError("");

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, [selectedResponse?.id]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const tipMethods = useMemo(() => {
    if (!tipProfile) {
      return [] as Array<{ key: TipMethodKey; label: string; value: string; href: string | null }>;
    }

    return tipMethodConfigs.flatMap(({ key, label }) => {
      const value = tipProfile[key];

      if (typeof value !== "string" || !value.trim()) {
        return [];
      }

      return [{
        key,
        label,
        value,
        href: getTipHref(key, value),
      }];
    });
  }, [tipProfile]);

  const handleTipToggle = async () => {
    if (!selectedResponse) {
      return;
    }

    if (showTipPanel) {
      setShowTipPanel(false);
      return;
    }

    setShowTipPanel(true);
    setTipError("");

    if (tipProfileResponseId === selectedResponse.id && tipProfile) {
      return;
    }

    const responseId = selectedResponse.id;
    const fallbackAnonymousLabel = selectedResponse.anonymousLabel;
    setIsLoadingTipProfile(true);

    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("paypal_handle, venmo_handle, cash_app_handle")
        .eq("id", selectedResponse.testerUserId)
        .maybeSingle();

      if (selectedResponseIdRef.current !== responseId) {
        return;
      }

      if (error) {
        throw new Error(error.message);
      }

      const payload = (data ?? {}) as {
        paypal_handle?: string | null;
        venmo_handle?: string | null;
        cash_app_handle?: string | null;
      };
      setTipProfileResponseId(responseId);
      setTipProfile({
        anonymousLabel: fallbackAnonymousLabel,
        paypalHandle: typeof payload.paypal_handle === "string" ? payload.paypal_handle : null,
        venmoHandle: typeof payload.venmo_handle === "string" ? payload.venmo_handle : null,
        cashAppHandle: typeof payload.cash_app_handle === "string" ? payload.cash_app_handle : null,
      });
    } catch (error) {
      if (selectedResponseIdRef.current !== responseId) {
        return;
      }

      setTipProfileResponseId(responseId);
      setTipProfile(null);
      setTipError(
        error instanceof Error ? error.message : "We couldn't load tip details right now.",
      );
    } finally {
      if (selectedResponseIdRef.current === responseId) {
        setIsLoadingTipProfile(false);
      }
    }
  };

  const handleCopyTipMethod = async (methodKey: TipMethodKey, value: string) => {
    const copied = await copyTextToClipboard(value);

    if (!copied) {
      setTipError("We couldn't copy that automatically. Please copy it manually.");
      return;
    }

    setCopiedTipMethod(methodKey);
    setTipError("");

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopiedTipMethod((current) => (current === methodKey ? null : current));
      copyResetTimeoutRef.current = null;
    }, 1800);
  };

  const handleRecordingAccess = async (mode: "watch" | "download") => {
    if (!selectedResponse || !selectedRecording || recordingIsExpired) {
      return;
    }

    const pendingWindow = typeof window !== "undefined"
      ? window.open("", "_blank", "noopener,noreferrer")
      : null;

    setRecordingAction(mode);
    setRecordingActionError("");

    try {
      const recordingUrl = await requestResponseRecordingUrl(
        selectedResponse.id,
        mode === "download",
      );

      if (pendingWindow && !pendingWindow.closed) {
        pendingWindow.location.href = recordingUrl.url;
      } else {
        window.open(recordingUrl.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      if (pendingWindow && !pendingWindow.closed) {
        pendingWindow.close();
      }

      setRecordingActionError(
        error instanceof Error ? error.message : "The recording could not be opened right now.",
      );
    } finally {
      setRecordingAction(null);
    }
  };

  const refreshPreset = (mode: QuestionMode) => {
    if (!submission) {
      return;
    }

    setEditMode(mode);
    if (mode === "general") {
      setEditQuestions(buildGeneralQuestions(submission.productName));
      return;
    }

    if (mode === "ai") {
      setEditQuestions(
        buildAiQuestions({
          productName: submission.productName,
          productTypes: submission.productTypes,
          description: submission.description,
          targetAudience: submission.targetAudience,
          instructions: submission.instructions,
          accessLinks: submission.accessLinks,
          requiresRecording: submission.requiresRecording,
          questionMode: mode,
        }),
      );
      return;
    }

    setEditQuestions(activeQuestionSet?.questions ?? defaultCustomQuestions(submission.productName));
  };

  const hasReachedEditQuestionLimit = editQuestions.length >= 10;

  const updateEditQuestion = (index: number, next: Partial<Question>) => {
    setEditQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...next } : question,
      ),
    );
  };

  const addEditQuestion = (type: Question["type"]) => {
    if (hasReachedEditQuestionLimit) {
      return;
    }

    setEditQuestions((current) =>
      [
        ...current,
        {
          id: `${editMode}-${Date.now()}-${current.length}`,
          title: "",
          type,
          required: true,
          sortOrder: current.length + 1,
          options: type === "multiple" ? ["Option 1", "Option 2"] : undefined,
        },
      ].map((question, questionIndex) => ({
        ...question,
        sortOrder: questionIndex + 1,
      })),
    );
  };

  const removeEditQuestion = (index: number) => {
    setEditQuestions((current) =>
      current
        .filter((_, questionIndex) => questionIndex !== index)
        .map((question, questionIndex) => ({
          ...question,
          sortOrder: questionIndex + 1,
        })),
    );
  };

  const duplicateEditQuestion = (index: number) => {
    if (hasReachedEditQuestionLimit) {
      return;
    }

    const sourceQuestion = editQuestions[index];

    if (!sourceQuestion) {
      return;
    }

    const duplicate: Question = {
      ...sourceQuestion,
      id: `${editMode}-${Date.now()}-${index}-duplicate`,
      options: sourceQuestion.options ? [...sourceQuestion.options] : undefined,
    };

    setEditQuestions((current) =>
      [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)].map(
        (question, questionIndex) => ({
          ...question,
          sortOrder: questionIndex + 1,
        }),
      ),
    );
  };

  const visibleEditMode: "custom" | "ai" = editMode === "ai" ? "ai" : "custom";
  const shouldShowVersionSwitcher = submissionVersions.length > 1 || (selectedVersion?.versionNumber ?? 1) > 1;

  if (!currentUser || !submission || submission.userId !== currentUser.id || !selectedVersion || !activeQuestionSet || !summary) {
    return (
      <AppShell title="Results" description="That submission could not be found.">
        <Surface><p>Try returning to My Tests and opening one of your submissions.</p></Surface>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrowLabel={null}>
      <div className="page-stack results-page">
        <Surface className="results-header-card">
          <div className="results-header-card__title-row">
            <div className="results-header-card__copy">
              <h1>{submission.productName}</h1>
              <p>{submission.description || "All of your tester feedback will appear here as responses come in."}</p>
            </div>
            {accessLinks.length > 0 ? (
              <div className="results-header-card__actions inline-actions">
                {accessLinks.map((link) => (
                  <a
                    key={link.productType}
                    href={link.normalizedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="button button--secondary"
                  >
                    {link.buttonLabel}
                    <ExternalLink size={16} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="results-header-card__meta">
            <span>{allResponses.length} {allResponses.length === 1 ? "response" : "responses"}</span>
            <span>{latestResponse ? `Latest feedback ${formatDateTime(latestResponse.submittedAt)}` : "No feedback yet"}</span>
          </div>
        </Surface>

        <Surface className="results-section">
          <div className="results-version-header">
            <div className="results-version-header__copy">
              <h2>{selectedVersion.title}</h2>
              {selectedVersion.description ? <p>{selectedVersion.description}</p> : null}
            </div>
            {shouldShowVersionSwitcher ? (
              <div
                className={`results-version-switcher${submissionVersions.length === 1 ? " results-version-switcher--single" : " results-version-switcher--multi"}`}
                role="tablist"
                aria-label="Versions"
              >
                {submissionVersions.map((version) => {
                  const versionResponseCount = responseCountsByVersion.get(version.id) ?? 0;

                  return (
                    <div
                      key={version.id}
                      className={`results-version-switcher__item${selectedVersion.id === version.id ? " results-version-switcher__item--active" : ""}`}
                    >
                      <button
                        type="button"
                        className="results-version-switcher__button"
                        onClick={() => setSelectedVersionId(version.id)}
                        aria-pressed={selectedVersion.id === version.id}
                      >
                        {`Version ${version.versionNumber}`}
                      </button>
                      {submissionVersions.length > 1 ? (
                        <button
                          type="button"
                          className="results-version-switcher__remove"
                          onClick={(event) => {
                            event.stopPropagation();
                            openVersionDeleteConfirm(version.id);
                          }}
                          aria-label={
                            versionResponseCount > 0
                              ? `Delete Version ${version.versionNumber}, tested ${versionResponseCount} ${versionResponseCount === 1 ? "time" : "times"}`
                              : `Delete Version ${version.versionNumber}`
                          }
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="results-section__header results-section__header--responses">
            <button type="button" className="button button--secondary" onClick={openVersionCreator}>
              New Version
            </button>
            <div className="results-toggle" role="tablist" aria-label="Response view">
              <button
                type="button"
                className={`results-toggle__button${responseView === "all" ? " results-toggle__button--active" : ""}`}
                onClick={() => setResponseView("all")}
              >
                All Responses
              </button>
              <button
                type="button"
                className={`results-toggle__button${responseView === "individual" ? " results-toggle__button--active" : ""}`}
                onClick={() => setResponseView("individual")}
              >
                Individual Responses
              </button>
            </div>
            <button type="button" className="button button--secondary" onClick={openQuestionEditor}>
              Edit questions
            </button>
          </div>

          {responseView === "all" ? (
            responses.length === 0 ? (
              <div className="results-placeholder">
                <strong>No responses yet</strong>
                <p>When testers start using this version, the results will appear here.</p>
              </div>
            ) : (
              <div className="question-list question-list--studio question-list--results-overview">
                {summary.analytics.map((item) => {
                  if (item.type === "paragraph") {
                    return (
                      <article key={item.question.id} className="question-card question-card--studio question-card--results-overview">
                        <div className="question-card__body">
                          <h4>{item.question.title}</h4>
                          {item.responses.length > 0 ? (
                            <div className="results-paragraph-list">
                              {item.responses.map((response, index) => (
                                <article key={`${item.question.id}-${index}`} className="results-paragraph-card">
                                  <span className="results-paragraph-card__label">Response {index + 1}</span>
                                  <p>{response}</p>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="question-card__response-preview">
                              <span>Written responses</span>
                              <p>No written responses yet.</p>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  }

                  const maxCount = Math.max(...item.counts.map((count) => count.count), 0);

                  return (
                    <article key={item.question.id} className="question-card question-card--studio question-card--results-overview">
                      <div className="question-card__body">
                        <h4>{item.question.title}</h4>
                        <div className="results-choice-list">
                          {item.counts.map((count) => {
                            const percent = item.total > 0 ? Math.round((count.count / item.total) * 100) : 0;
                            const emphasis = maxCount > 0 ? count.count / maxCount : 0;

                            return (
                              <div
                                key={count.option}
                                className={`results-choice-row${maxCount > 0 && count.count === maxCount ? " results-choice-row--top" : ""}`}
                                style={{
                                  backgroundColor: `rgba(245, 142, 86, ${0.04 + emphasis * 0.18})`,
                                  borderColor: `rgba(245, 142, 86, ${0.14 + emphasis * 0.22})`,
                                }}
                              >
                                <span className="results-choice-row__icon" aria-hidden="true" />
                                <span className="results-choice-row__label">{count.option}</span>
                                <strong className="results-choice-row__percent">{percent}%</strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : selectedResponse ? (
            <div className="results-individual-shell">
              <div className="results-individual-shell__header">
                <div className="results-individual-shell__identity">
                  <span className="results-individual-shell__number">{selectedResponseIndex + 1}</span>
                  <div>
                    <h3>Response {selectedResponseIndex + 1}</h3>
                    <p>{formatDateTime(selectedResponse.submittedAt)} / {selectedResponse.anonymousLabel}</p>
                  </div>
                </div>
                <div className="results-individual-shell__actions">
                  <div className="results-individual-nav" aria-label="Response navigation">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setSelectedResponseIndex((current) => Math.max(0, current - 1))}
                      disabled={selectedResponseIndex === 0}
                      aria-label="Previous response"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setSelectedResponseIndex((current) => Math.min(responses.length - 1, current + 1))}
                      disabled={selectedResponseIndex === responses.length - 1}
                      aria-label="Next response"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <div className="results-individual-shell__feedback-actions">
                    <ReactionFaces
                      value={selectedRating?.ratingValue}
                      onChange={(value) => { void rateFeedback(selectedResponse.id, value); }}
                    />
                    <button
                      type="button"
                      className={`reaction-face results-tip-button${showTipPanel ? " results-tip-button--active" : ""}`}
                      onClick={() => { void handleTipToggle(); }}
                      disabled={isLoadingTipProfile}
                      aria-expanded={showTipPanel}
                      aria-pressed={showTipPanel}
                      aria-controls="response-tip-panel"
                    >
                      {isLoadingTipProfile ? <span className="button__spinner" aria-hidden="true" /> : <HandCoins size={18} aria-hidden="true" />}
                      <span>{isLoadingTipProfile ? "Loading" : "Tip"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {showTipPanel ? (
                <div id="response-tip-panel" className="results-tip-panel" role="region" aria-label="Tip this tester">
                  <div className="results-tip-panel__header">
                    <div>
                      <h4>Tip {tipProfile?.anonymousLabel ?? selectedResponse.anonymousLabel}</h4>
                      <p>Choose a payment method to copy or open in a new tab.</p>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowTipPanel(false)}
                      aria-label="Close tip options"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {isLoadingTipProfile ? (
                    <div className="results-tip-loading" aria-live="polite">
                      <span className="button__spinner" aria-hidden="true" />
                      <span>Loading tip methods...</span>
                    </div>
                  ) : tipError ? (
                    <div className="results-tip-empty results-tip-empty--warning" aria-live="polite">
                      <strong>Tip methods unavailable</strong>
                      <p>{tipError}</p>
                    </div>
                  ) : tipMethods.length > 0 ? (
                    <div className="results-tip-methods">
                      {tipMethods.map((method) => (
                        <article key={method.key} className="results-tip-method">
                          <div className="results-tip-method__meta">
                            <small>{method.label}</small>
                            <strong>{method.value}</strong>
                          </div>
                          <div className="results-tip-method__actions">
                            <button
                              type="button"
                              className="results-tip-chip"
                              onClick={() => { void handleCopyTipMethod(method.key, method.value); }}
                            >
                              {copiedTipMethod === method.key ? "Copied" : "Copy"}
                            </button>
                            {method.href ? (
                              <a
                                className="results-tip-chip results-tip-chip--primary"
                                href={method.href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                                <ExternalLink size={14} aria-hidden="true" />
                              </a>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="results-tip-empty" aria-live="polite">
                      <strong>No tip methods yet</strong>
                      <p>This tester has not added a payment method to their profile.</p>
                    </div>
                  )}
                </div>
              ) : null}
              {showRecordingPanel ? (
                <div className="results-recording-panel">
                  <div className="results-recording-panel__copy">
                    <span className="test-session__label">Screen recording</span>
                    {selectedRecording ? (
                      <>
                        <strong>{recordingIsExpired ? "Expired" : `Available until ${formatDateTime(selectedRecording.expiresAt)}`}</strong>
                        <p>
                          {recordingIsExpired
                            ? "This recording has already been deleted or passed its 7-day retention window."
                            : `${selectedRecording.fileName} • ${formatRecordingSize(selectedRecording.fileSizeBytes)}`}
                        </p>
                      </>
                    ) : (
                      <>
                        <strong>No recording attached</strong>
                        <p>This response does not have an available screen recording.</p>
                      </>
                    )}
                  </div>
                  {selectedRecording && !recordingIsExpired ? (
                    <div className="results-recording-panel__actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => { void handleRecordingAccess("watch"); }}
                        disabled={recordingAction !== null}
                      >
                        {recordingAction === "watch" ? <span className="button__spinner" aria-hidden="true" /> : null}
                        Watch recording
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => { void handleRecordingAccess("download"); }}
                        disabled={recordingAction !== null}
                      >
                        {recordingAction === "download" ? <span className="button__spinner" aria-hidden="true" /> : null}
                        Download recording
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {recordingActionError ? (
                <div className="callout callout--warning">
                  <span>{recordingActionError}</span>
                </div>
              ) : null}

              <div className="answer-list"> 
                {selectedResponse.answers.map((answer) => (
                  <article key={answer.questionId} className="answer-card">
                    <strong>{answer.questionTitle}</strong>
                    <p>{answer.type === "multiple" ? answer.selectedOption : answer.textAnswer}</p>
                  </article>
                ))}
              </div>

              {selectedResponse.internalFlags.length > 0 ? (
                <div className="callout callout--warning">
                  <MessageSquareQuote size={18} />
                  <span>{selectedResponse.internalFlags.join(" / ")}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="results-placeholder">
              <strong>No responses yet</strong>
              <p>When testers begin submitting feedback for this version, each response will appear here.</p>
            </div>
          )}
        </Surface>
      </div>

      {showVersionCreator ? (
        <div className="results-modal-backdrop" role="presentation" onClick={closeVersionCreator}>
          <div className="results-modal results-modal--version-creator" role="dialog" aria-modal="true" aria-label="New version" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal__header">
              <div>
                <h2>New Version</h2>
                <p>Keep track of feedback and compare results with previous versions of your app. We recommend creating a new version only after you've released major updates or changes to your app.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeVersionCreator} aria-label="Close new version">
                <X size={18} />
              </button>
            </div>

            <div className="form-stack form-stack--narrow results-version-form">
              <label className="field">
                <span>Version title</span>
                <input
                  value={nextVersionTitle}
                  onChange={(event) => setNextVersionTitle(event.target.value)}
                  placeholder={`Version ${nextVersionNumber}`}
                />
              </label>
              <label className="field">
                <span>Version description</span>
                <textarea
                  rows={4}
                  value={nextVersionDescription}
                  onChange={(event) => setNextVersionDescription(event.target.value)}
                  placeholder={defaultVersionDescription}
                />
              </label>
              {versionCreateError ? (
                <div className="callout callout--warning">
                  <span>{versionCreateError}</span>
                </div>
              ) : null}
            </div>

            <div className="wizard-actions">
              <button type="button" className="button button--secondary" onClick={closeVersionCreator} disabled={isCreatingVersion}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => { void handleCreateVersion(); }}
                disabled={isCreatingVersion || !nextVersionTitle.trim()}
              >
                {isCreatingVersion ? <span className="button__spinner" aria-hidden="true" /> : null}
                Create version
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showVersionDeleteConfirm && versionPendingDelete ? (
        <div className="results-modal-backdrop" role="presentation" onClick={closeVersionDeleteConfirm}>
          <div className="results-modal results-modal--version-delete" role="dialog" aria-modal="true" aria-label="Delete version" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal__header">
              <div>
                <h2>Delete Version</h2>
                <p>Delete {versionPendingDelete.title}? Test responses for this version will be <strong>permanently deleted</strong>.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeVersionDeleteConfirm} aria-label="Close delete version">
                <X size={18} />
              </button>
            </div>

            <div className="form-stack form-stack--narrow results-version-form">
              {versionPendingDeleteResponseCount > 0 ? (
                <p className="results-version-delete-count">
                  {`This version has been tested ${versionPendingDeleteResponseCount} ${versionPendingDeleteResponseCount === 1 ? "time" : "times"}.`}
                </p>
              ) : null}
              {versionDeleteError ? (
                <div className="callout callout--warning">
                  <span>{versionDeleteError}</span>
                </div>
              ) : null}
            </div>

            <div className="wizard-actions">
              <button type="button" className="button button--secondary" onClick={closeVersionDeleteConfirm} disabled={isDeletingVersion}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary results-version-delete-button"
                onClick={() => { void handleDeleteVersion(); }}
                disabled={isDeletingVersion}
              >
                {isDeletingVersion ? <span className="button__spinner" aria-hidden="true" /> : null}
                Delete version
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showQuestionEditor ? (
        <div className="results-modal-backdrop" role="presentation" onClick={() => setShowQuestionEditor(false)}>
          <div className="results-modal" role="dialog" aria-modal="true" aria-label="Edit questions" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal__header">
              <div>
                <h2>Edit questions</h2>
                <p>Question edits update the current Test4Test questionnaire. They do not create a new app version, and past responses stay attached to what testers originally submitted.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowQuestionEditor(false)} aria-label="Close edit questions">
                <X size={18} />
              </button>
            </div>
            <div className="question-studio">
              <div className="question-studio__header">
                <div className="question-mode-strip">
                  {[
                    { value: "custom", title: "Custom questions" },
                    { value: "ai", title: "AI-generated questions" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`question-mode-button${visibleEditMode === option.value ? " question-mode-button--active" : ""}`}
                      onClick={() => refreshPreset(option.value === "ai" ? "ai" : "general")}
                    >
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="question-list question-list--studio">
                {editQuestions.map((question, index) => (
                  <article key={question.id} className="question-card question-card--studio">
                    <div className="question-card__topbar">
                      <div className="question-card__meta question-card__meta--editor">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeEditQuestion(index)}
                          aria-label="Remove question"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="question-card__body">
                      <div className="question-card__prompt-row">
                        <AutoResizeTextarea
                          className="question-card__prompt-input"
                          value={question.title}
                          onChange={(event) => updateEditQuestion(index, { title: event.target.value })}
                          placeholder="Type your question here"
                        />
                      </div>
                      {question.type === "multiple" ? (
                        <div className="option-list option-list--editor">
                          {(question.options ?? []).map((option, optionIndex) => (
                            <div key={`${question.id}-${optionIndex}`} className="option-input-row">
                              <span className="option-input-row__icon" aria-hidden="true" />
                              <input
                                className="option-input-row__input"
                                value={option}
                                onChange={(event) => {
                                  const nextOptions = [...(question.options ?? [])];
                                  nextOptions[optionIndex] = event.target.value;
                                  updateEditQuestion(index, { options: nextOptions });
                                }}
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                              <button
                                type="button"
                                className="option-input-row__remove"
                                onClick={() => {
                                  const nextOptions = (question.options ?? []).filter((_, currentIndex) => currentIndex !== optionIndex);
                                  updateEditQuestion(index, { options: nextOptions });
                                }}
                                aria-label={`Remove option ${optionIndex + 1}`}
                                disabled={(question.options?.length ?? 0) <= 2}
                              >
                                <X size={16} strokeWidth={2} aria-hidden />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="question-card__response-preview">
                          <span>Written answer</span>
                          <p>Testers will leave written feedback here.</p>
                        </div>
                      )}
                    </div>
                    {question.type === "multiple" ? (
                      <div className="question-card__custom-actions">
                        {(question.options?.length ?? 0) < 6 ? (
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() =>
                              updateEditQuestion(index, {
                                options: [
                                  ...(question.options ?? []),
                                  `Option ${(question.options?.length ?? 0) + 1}`,
                                ],
                              })
                            }
                          >
                            <Plus size={16} />
                            Add option
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button button--secondary question-card__duplicate-button"
                          onClick={() => duplicateEditQuestion(index)}
                          disabled={hasReachedEditQuestionLimit}
                        >
                          Duplicate
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="question-studio__footer">
                <div className="inline-actions inline-actions--compact">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => addEditQuestion("multiple")}
                    disabled={hasReachedEditQuestionLimit}
                  >
                    <Plus size={16} />
                    Add multiple choice
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => addEditQuestion("paragraph")}
                    disabled={hasReachedEditQuestionLimit}
                  >
                    <Plus size={16} />
                    Add paragraph question
                  </button>
                </div>
              </div>
            </div>

            <div className="wizard-actions">
              <button type="button" className="button button--secondary" onClick={() => refreshPreset(editMode)}>
                <RefreshCcw size={16} />
                Reset from preset
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  if (!activeQuestionSet) {
                    return;
                  }

                  void updateQuestionSet(submission.id, activeQuestionSet.id, editMode, editQuestions);
                  setShowQuestionEditor(false);
                }}
              >
                <Save size={16} />
                Save questions
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}































