import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
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
  getResponseRating,
  getSubmissionResponses,
} from "../lib/selectors";
import { requireSupabase } from "../lib/supabase";
import { PaymentMethods, Question, QuestionMode } from "../types";

type ResponseViewMode = "all" | "individual";
type TipMethodKey = "paypalHandle" | "venmoHandle" | "cashAppHandle";

interface TipProfile extends PaymentMethods {
  anonymousLabel: string;
}

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

export function SubmissionDetailPage() {
  const { submissionId = "" } = useParams();
  const { state, currentUser, rateFeedback, updateQuestionSet } = useAppState();
  const submission = state.submissions.find((item) => item.id === submissionId);
  const activeVersion = submission ? getActiveQuestionSet(state, submission.id) : null;
  const responses = submission ? getSubmissionResponses(state, submission.id) : [];
  const summary = submission ? buildSubmissionSummary(state, submission, responses) : null;
  const latestResponse = responses[0] ?? null;
  const accessLinks = useMemo(
    () => (submission ? getOrderedAccessLinks(submission.accessLinks, submission.productTypes) : []),
    [submission],
  );
  const [responseView, setResponseView] = useState<ResponseViewMode>("all");
  const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);
  const [editMode, setEditMode] = useState<QuestionMode>(submission?.questionMode ?? "general");
  const [editQuestions, setEditQuestions] = useState<Question[]>(activeVersion?.questions ?? []);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [showTipPanel, setShowTipPanel] = useState(false);
  const [isLoadingTipProfile, setIsLoadingTipProfile] = useState(false);
  const [tipProfile, setTipProfile] = useState<TipProfile | null>(null);
  const [tipProfileResponseId, setTipProfileResponseId] = useState<string | null>(null);
  const [tipError, setTipError] = useState("");
  const [copiedTipMethod, setCopiedTipMethod] = useState<TipMethodKey | null>(null);
  const selectedResponseIdRef = useRef<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  const savedEditMode: QuestionMode = activeVersion?.mode ?? submission?.questionMode ?? "general";
  const savedEditQuestions = activeVersion?.questions ?? [];

  const openQuestionEditor = () => {
    setEditMode(savedEditMode);
    setEditQuestions(savedEditQuestions);
    setShowQuestionEditor(true);
  };

  useEffect(() => {
    setSelectedResponseIndex(0);
    setEditMode(savedEditMode);
    setEditQuestions(savedEditQuestions);
  }, [submission?.id, activeVersion?.id, savedEditMode, responses.length]);

  const selectedResponse = responses[selectedResponseIndex] ?? null;
  const selectedRating = selectedResponse
    ? getResponseRating(state, selectedResponse.id, currentUser?.id ?? null)
    : null;

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
          questionMode: mode,
        }),
      );
      return;
    }

    setEditQuestions(activeVersion?.questions ?? defaultCustomQuestions(submission.productName));
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

  const multipleChoiceSummary = useMemo(
    () => summary?.analytics.filter((item) => item.type === "multiple") ?? [],
    [summary],
  );

  const paragraphSummary = useMemo(
    () => summary?.analytics.filter((item) => item.type === "paragraph") ?? [],
    [summary],
  );

  if (!currentUser || !submission || submission.userId !== currentUser.id || !summary) {
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
            <span>{responses.length} {responses.length === 1 ? "response" : "responses"}</span>
            <span>{latestResponse ? `Latest feedback ${formatDateTime(latestResponse.submittedAt)}` : "No feedback yet"}</span>
          </div>
        </Surface>

        <Surface className="results-section">
          <div className="results-section__header">
            <div>
              <h2>Feedback overview</h2>
              <p>Patterns and themes update here as testers respond.</p>
            </div>
          </div>

          {responses.length === 0 ? (
            <div className="results-placeholder">
              <strong>No feedback yet</strong>
              <p>Once someone completes your test, this page will start surfacing trends, top friction points, and written themes.</p>
            </div>
          ) : (
            <div className="results-summary-columns">
              <div>
                <h3>Multiple-choice trends</h3>
                <div className="chart-list">
                  {multipleChoiceSummary.map((item) => (
                    <article key={item.question.id} className="chart-card chart-card--elevated">
                      <div className="chart-card__header">
                        <h4>{item.question.title}</h4>
                        <span className="pill"><BarChart3 size={14} /> Avg {item.averageScore.toFixed(1)}</span>
                      </div>
                      {item.counts.map((count) => (
                        <div key={count.option} className="bar-row">
                          <span>{count.option}</span>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: item.total > 0 ? `${(count.count / item.total) * 100}%` : "0%" }} />
                          </div>
                          <strong>{count.count}</strong>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <h3>Written feedback themes</h3>
                <div className="results-theme-stack">
                  <div className="theme-card results-theme-card">
                    <strong>Most praised</strong>
                    <div className="tag-row">
                      {summary.topPositiveThemes.map((theme) => (
                        <span key={theme} className="tag tag--warm">{theme}</span>
                      ))}
                    </div>
                  </div>
                  <div className="theme-card results-theme-card">
                    <strong>Most confusing</strong>
                    <div className="tag-row">
                      {summary.topFrictionThemes.map((theme) => (
                        <span key={theme} className="tag tag--rose">{theme}</span>
                      ))}
                    </div>
                  </div>
                  <div className="theme-card results-theme-card">
                    <strong>Prompts generating detail</strong>
                    <ul className="check-list">
                      {paragraphSummary.slice(0, 3).map((item) => (
                        <li key={item.question.id}>{item.question.title}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Surface>

        <Surface className="results-section">
          <div className="results-section__header results-section__header--responses">
            <div>
              <h2>Responses</h2>
            </div>
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
              <p>When testers begin submitting feedback, each response will appear here.</p>
            </div>
          )}
        </Surface>
      </div>

      {showQuestionEditor ? (
        <div className="results-modal-backdrop" role="presentation" onClick={() => setShowQuestionEditor(false)}>
          <div className="results-modal" role="dialog" aria-modal="true" aria-label="Edit questions" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal__header">
              <div>
                <h2>Edit questions</h2>
                <p>Changes here only affect future testers. Older responses stay attached to the version they answered.</p>
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
                  void updateQuestionSet(submission.id, editMode, editQuestions);
                  setShowQuestionEditor(false);
                }}
              >
                <Save size={16} />
                Save as next version
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}







