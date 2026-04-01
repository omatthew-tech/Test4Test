import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Plus, RefreshCcw, Sparkles, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { StepIndicator } from "../components/StepIndicator";
import { useAppState } from "../context/AppStateContext";
import { buildAiQuestionDraftKey, generateAiQuestions } from "../lib/aiQuestionsClient";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  accessLinksSummary,
  getOrderedAccessLinks,
  normalizeProductTypes,
  productTypeLabel,
  productTypesLabel,
  PRODUCT_TYPE_ORDER,
} from "../lib/format";
import {
  buildGeneralQuestions,
  buildRandomGeneralQuestions,
  defaultCustomQuestions,
  questionModeLabel,
  questionTypeLabel,
  syncGeneralQuestionsProductName,
  validateAccessLink,
} from "../lib/questions";
import { ProductType, Question, SubmissionDraft } from "../types";


const steps = [
  "App name",
  "App types",
  "App links",
  "Questions",
  "Review",
];

const productTypeOptions: Array<{
  value: ProductType;
  title: string;
}> = PRODUCT_TYPE_ORDER.map((value) => ({
  value,
  title: productTypeLabel(value),
}));

type AiQuestionStatus = "idle" | "loading" | "ready" | "error";

function createBlankQuestion(
  index: number,
  type: Question["type"],
  prefix = "custom",
): Question {
  return {
    id: `${prefix}-${Date.now()}-${index}`,
    title: "",
    type,
    required: true,
    sortOrder: index + 1,
    options: type === "multiple" ? ["Option 1", "Option 2"] : undefined,
  };
}

export function SubmitFlowPage() {
  const [searchParams] = useSearchParams();
  const initialProductName = searchParams.get("productName") ?? "";
  const resumeVerifyEmail = searchParams.get("phase") === "verify-email";
  const initialEmail = searchParams.get("email") ?? "";
  const initialSubmissionId = searchParams.get("submissionId");
  const navigate = useNavigate();
  const { currentUser, createSubmission, requestOtp } = useAppState();
  const [currentStep, setCurrentStep] = useState(resumeVerifyEmail ? steps.length : 0);
  const [submissionId, setSubmissionId] = useState<string | null>(initialSubmissionId);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [pendingScrollQuestionId, setPendingScrollQuestionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const questionCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [draft, setDraft] = useState<SubmissionDraft>({
    productName: initialProductName,
    productTypes: [],
    description: "",
    targetAudience: "",
    instructions: "",
    accessLinks: {},
    questionMode: "general",
  });
  const [generalQuestions, setGeneralQuestions] = useState<Question[]>(() =>
    buildGeneralQuestions(initialProductName || "Your product"),
  );
  const [customQuestions, setCustomQuestions] = useState<Question[]>(() =>
    defaultCustomQuestions(initialProductName || "Your product"),
  );
  const [aiQuestions, setAiQuestions] = useState<Question[]>([]);
  const [aiQuestionStatus, setAiQuestionStatus] = useState<AiQuestionStatus>("idle");
  const [aiQuestionError, setAiQuestionError] = useState("");
  const [aiQuestionNotice, setAiQuestionNotice] = useState("");
  const [aiQuestionSourceKey, setAiQuestionSourceKey] = useState<string | null>(null);

  useEffect(() => {
    setGeneralQuestions((current) =>
      syncGeneralQuestionsProductName(current, draft.productName || "Your product"),
    );
  }, [draft.productName]);

  useEffect(() => {
    if (!pendingScrollQuestionId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const nextQuestionCard = questionCardRefs.current[pendingScrollQuestionId];

      if (!nextQuestionCard) {
        return;
      }

      nextQuestionCard.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusTarget = nextQuestionCard.querySelector<HTMLInputElement>(
        ".question-card__prompt-input, .option-input-row__input",
      );
      focusTarget?.focus({ preventScroll: true });
      setPendingScrollQuestionId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingScrollQuestionId, customQuestions]);

  const selectedProductTypes = useMemo(
    () => normalizeProductTypes(draft.productTypes),
    [draft.productTypes],
  );
  const orderedAccessLinks = useMemo(
    () => getOrderedAccessLinks(draft.accessLinks, selectedProductTypes),
    [draft.accessLinks, selectedProductTypes],
  );
  const accessLinksSummaryText = useMemo(
    () => accessLinksSummary(draft.accessLinks, selectedProductTypes),
    [draft.accessLinks, selectedProductTypes],
  );
  const aiQuestionDraftKey = useMemo(() => buildAiQuestionDraftKey(draft), [draft]);
  const hasCurrentAiQuestions =
    aiQuestionSourceKey === aiQuestionDraftKey && aiQuestions.length > 0;
  const editableQuestions = useMemo(() => {
    if (draft.questionMode === "general") {
      return generalQuestions;
    }

    if (draft.questionMode === "custom") {
      return customQuestions;
    }

    if (draft.questionMode === "ai" && hasCurrentAiQuestions) {
      return aiQuestions;
    }

    return [];
  }, [aiQuestions, customQuestions, draft.questionMode, generalQuestions, hasCurrentAiQuestions]);
  const isEditableQuestionMode =
    draft.questionMode === "general" ||
    draft.questionMode === "custom" ||
    (draft.questionMode === "ai" && hasCurrentAiQuestions);
  const hasReachedEditableQuestionLimit = editableQuestions.length >= 10;

  const displayedQuestions = useMemo(() => {
    if (draft.questionMode === "general") {
      return generalQuestions;
    }

    if (draft.questionMode === "custom") {
      return customQuestions;
    }

    return hasCurrentAiQuestions ? aiQuestions : [];
  }, [
    aiQuestions,
    customQuestions,
    draft.questionMode,
    generalQuestions,
    hasCurrentAiQuestions,
  ]);

  useEffect(() => {
    if (draft.questionMode !== "ai") {
      return;
    }

    if (aiQuestionStatus === "ready" && !hasCurrentAiQuestions) {
      setAiQuestionStatus("idle");
      setAiQuestionNotice("");
    }
  }, [aiQuestionStatus, draft.questionMode, hasCurrentAiQuestions]);

  const refreshQuestions = () => {
    setError("");
    setGeneralQuestions(buildRandomGeneralQuestions(draft.productName || "Your product"));
  };

  const generateQuestionSet = async () => {
    setError("");
    setAiQuestionError("");
    setAiQuestionNotice("");
    setAiQuestionStatus("loading");

    try {
      const requestKey = aiQuestionDraftKey;
      const generationResult = await generateAiQuestions({
        ...draft,
        productName: draft.productName || "Your product",
      });

      setAiQuestions(generationResult.questions);
      setAiQuestionNotice(generationResult.notice ?? "");
      setAiQuestionSourceKey(requestKey);
      setAiQuestionStatus("ready");
    } catch (generationError) {
      setAiQuestionStatus("error");
      setAiQuestionNotice("");
      setAiQuestionError(
        generationError instanceof Error
          ? generationError.message
          : "AI question generation failed. Please try again.",
      );
    }
  };

  const setEditableQuestions = (updater: (current: Question[]) => Question[]) => {
    if (draft.questionMode === "general") {
      setGeneralQuestions(updater);
      return;
    }

    if (draft.questionMode === "custom") {
      setCustomQuestions(updater);
      return;
    }

    if (draft.questionMode === "ai") {
      setAiQuestions(updater);
    }
  };

  const updateQuestion = (index: number, next: Partial<Question>) => {
    setEditableQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...next } : question,
      ),
    );
  };

  const addQuestion = (type: Question["type"]) => {
    if (hasReachedEditableQuestionLimit) {
      setError("You can add up to 10 questions total.");
      return;
    }

    const nextQuestion = createBlankQuestion(
      editableQuestions.length,
      type,
      draft.questionMode === "general"
        ? "general"
        : draft.questionMode === "ai"
          ? "ai"
          : "custom",
    );

    setError("");
    setPendingScrollQuestionId(nextQuestion.id);
    setEditableQuestions((current) => {
      if (current.length >= 10) {
        return current;
      }

      return [...current, nextQuestion].map((question, index) => ({
        ...question,
        sortOrder: index + 1,
      }));
    });
  };

  const removeQuestion = (index: number) => {
    setError("");
    setEditableQuestions((current) =>
      current
        .filter((_, questionIndex) => questionIndex !== index)
        .map((question, questionIndex) => ({ ...question, sortOrder: questionIndex + 1 })),
    );
  };

  const duplicateQuestion = (index: number) => {
    if (hasReachedEditableQuestionLimit) {
      setError("You can add up to 10 questions total.");
      return;
    }

    const sourceQuestion = editableQuestions[index];

    if (!sourceQuestion) {
      return;
    }

    const duplicate: Question = {
      ...sourceQuestion,
      id: `${draft.questionMode}-${Date.now()}-${index}-duplicate`,
      options: sourceQuestion.options ? [...sourceQuestion.options] : undefined,
    };

    setError("");
    setPendingScrollQuestionId(duplicate.id);
    setEditableQuestions((current) => {
      if (current.length >= 10) {
        return current;
      }

      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)].map(
        (question, questionIndex) => ({ ...question, sortOrder: questionIndex + 1 }),
      );
    });
  };

  const setMode = (mode: SubmissionDraft["questionMode"]) => {
    setError("");
    setPendingScrollQuestionId(null);
    setAiQuestionError("");
    setAiQuestionNotice("");
    setDraft((current) => ({ ...current, questionMode: mode }));
  };

  const jumpToStep = (step: number) => {
    setError("");
    setPendingScrollQuestionId(null);
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const toggleProductType = (productType: ProductType) => {
    setError("");
    setDraft((current) => {
      const isSelected = current.productTypes.includes(productType);
      const nextProductTypes = normalizeProductTypes(
        isSelected
          ? current.productTypes.filter((value) => value !== productType)
          : [...current.productTypes, productType],
      );
      const nextAccessLinks = { ...current.accessLinks };

      if (isSelected) {
        delete nextAccessLinks[productType];
      }

      return {
        ...current,
        productTypes: nextProductTypes,
        accessLinks: nextAccessLinks,
      };
    });
  };

  const updateAccessLink = (productType: ProductType, value: string) => {
    setError("");
    setDraft((current) => ({
      ...current,
      accessLinks: {
        ...current.accessLinks,
        [productType]: value,
      },
    }));
  };
  const validateCurrentStep = () => {
    if (currentStep === 0 && !draft.productName.trim()) {
      return "Add an app name to continue.";
    }

    if (currentStep === 1 && draft.productTypes.length === 0) {
      return "Select at least one app type to continue.";
    }

    if (currentStep === 2) {
      for (const productType of selectedProductTypes) {
        const validation = validateAccessLink(draft.accessLinks[productType] ?? "", productType);

        if (!(draft.accessLinks[productType] ?? "").trim()) {
          return `Add a public ${accessLinkFieldLabel(productType).toLowerCase()} for testers.`;
        }

        if (!validation.valid) {
          return `${productTypeLabel(productType)}: ${validation.message}`;
        }
      }
    }

    if (currentStep === 3 && draft.questionMode === "ai") {
      if (aiQuestionStatus === "loading") {
        return "Wait for AI questions to finish generating.";
      }

      if (!hasCurrentAiQuestions) {
        return aiQuestionSourceKey && aiQuestionSourceKey !== aiQuestionDraftKey
          ? "Your app details changed. Generate Questions again to continue."
          : "Generate Questions to continue.";
      }
    }

    if (currentStep === 3 && isEditableQuestionMode) {
      const minimumQuestionCount = draft.questionMode === "custom" ? 2 : 5;

      if (
        editableQuestions.length < minimumQuestionCount ||
        editableQuestions.length > 10
      ) {
        return `${questionModeLabel(draft.questionMode)} mode needs between ${minimumQuestionCount} and 10 questions for MVP.`;
      }

      if (
        editableQuestions.some(
          (question) =>
            !question.title.trim() ||
            (question.type === "multiple" && (question.options?.filter(Boolean).length ?? 0) < 2),
        )
      ) {
        return "Each question needs a title, and multiple-choice questions need at least two options.";
      }
    }

    return "";
  };

  const goNext = async () => {
    const nextError = validateCurrentStep();
    if (nextError) {
      setError(nextError);
      return;
    }

    setError("");

    if (currentStep === 4) {
      setIsSubmitting(true);

      try {
        const createdId = await createSubmission(draft, displayedQuestions);
        setSubmissionId(createdId);
        setCurrentStep(steps.length);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "The submission could not be saved.",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const sendOtp = async () => {
    if (!email.trim() || !submissionId) {
      setError("Add an email so we can send the one-time code.");
      return;
    }

    setIsSendingCode(true);

    try {
      await requestOtp(email.trim(), submissionId);
      navigate(
        "/verify?email=" + encodeURIComponent(email.trim()) + "&submissionId=" + encodeURIComponent(submissionId),
      );
    } catch (otpError) {
      setError(
        otpError instanceof Error
          ? otpError.message
          : "We could not send a verification code.",
      );
    } finally {
      setIsSendingCode(false);
    }
  };

  return (
    <AppShell eyebrowLabel={null}>
      <div className="page-stack">
        {currentStep < steps.length ? (
          <div className="wizard-layout">
            <aside className="wizard-rail">
              <Surface className="wizard-rail__surface">
                <StepIndicator steps={steps} currentStep={currentStep} />
                <div className="wizard-preview">
                  <span className="eyebrow">Live preview</span>
                  <h3>{draft.productName || "Untitled app"}</h3>
                  {draft.description.trim() ? <p>{draft.description}</p> : null}

                  <div className="wizard-preview__stack">
                    <div className="wizard-preview__item">
                      <small>{selectedProductTypes.length > 1 ? "App links" : "App link"}</small>
                      {orderedAccessLinks.length > 0 ? (
                        <div className="wizard-link-list">
                          {orderedAccessLinks.map((link) => (
                            <a
                              key={link.productType}
                              href={link.normalizedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="wizard-preview__link"
                            >
                              <span className="wizard-preview__link-label">{link.label}</span>
                              <span>{link.displayUrl}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <strong>
                          {selectedProductTypes.length > 1
                            ? "Add a link for each selected platform"
                            : "Add your live app link"}
                        </strong>
                      )}
                    </div>
                    <div className="wizard-preview__item">
                      <small>Platforms</small>
                      {draft.productTypes.length > 0 ? (
                        <strong>{productTypesLabel(draft.productTypes)}</strong>
                      ) : (
                        <strong>Select at least one platform</strong>
                      )}
                    </div>
                    <div className="wizard-preview__item">
                      <small>Question setup</small>
                      <strong>{questionModeLabel(draft.questionMode)}</strong>
                    </div>
                  </div>
                </div>
              </Surface>
            </aside>

            <div className="wizard-stage">
              <Surface className="wizard-stage__surface">
                {currentStep === 0 ? (
                  <div className="form-stack">
                    <div className="section-heading">
                      <span className="eyebrow">Step 1</span>
                      <h2>What&apos;s the name of your app?</h2>
                    </div>
                    <label className="field">
                      <span>App name</span>
                      <input
                        value={draft.productName}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, productName: event.target.value }))
                        }
                        placeholder="Palette Pilot"
                      />
                    </label>
                    <label className="field">
                      <span>(optional) Short app description visible to testers</span>
                      <textarea
                        rows={4}
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        placeholder="Write something interesting to catch tester's attention i.e. Palette Pilot helps teams shape ideas faster."
                      />
                    </label>
                  </div>
                ) : null}

                {currentStep === 1 ? (
                  <div className="form-stack">
                    <div className="section-heading">
                      <span className="eyebrow">Step 2</span>
                      <h2>What kind of app is it?</h2>
                      <p>Choose every platform testers can use right now.</p>
                    </div>
                    <div className="choice-grid">
                      {productTypeOptions.map((option) => {
                        const isSelected = draft.productTypes.includes(option.value);

                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`choice-card choice-card--multi${isSelected ? " choice-card--active" : ""}`}
                            onClick={() => toggleProductType(option.value)}
                            aria-pressed={isSelected}
                          >
                            <span className={`choice-card__check${isSelected ? " choice-card__check--active" : ""}`} aria-hidden="true">
                              {isSelected ? <Check size={16} /> : null}
                            </span>
                            <span className="choice-card__content">
                              <strong>{option.title}</strong>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                  </div>
                ) : null}

                {currentStep === 2 ? (
                  <div className="form-stack">
                    <div className="section-heading">
                      <span className="eyebrow">Step 3</span>
                      <h2>{selectedProductTypes.length > 1 ? "What are the links to your app?" : "What's the link to your app?"}</h2>
                      {selectedProductTypes.length > 1 ? (
                        <p>Add one public link for each selected platform.</p>
                      ) : null}
                    </div>
                    {selectedProductTypes.map((productType) => {
                      const value = draft.accessLinks[productType] ?? "";
                      const validation = validateAccessLink(value, productType);

                      return (
                        <label key={productType} className="field">
                          <span>{accessLinkFieldLabel(productType)}</span>
                          <input
                            value={value}
                            onChange={(event) => updateAccessLink(productType, event.target.value)}
                            placeholder={accessLinkPlaceholder(productType)}
                          />
                          {value.trim() ? (
                            <small
                              className={`helper-text ${validation.valid ? "helper-text--success" : "helper-text--warning"}`}
                            >
                              {validation.message}
                            </small>
                          ) : null}
                        </label>
                      );
                    })}
                    <label className="field">
                      <span>(optional) Tester Instructions</span>
                      <textarea
                        rows={4}
                        value={draft.instructions}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, instructions: event.target.value }))
                        }
                        placeholder="Example: Test the onboarding flow, try search, create a sample item, and tell us anything confusing or slow."
                      />
                    </label>
                  </div>
                ) : null}

                {currentStep === 3 ? (
                  <div className="form-stack form-stack--question-studio">
                    <div className="section-heading">
                      <span className="eyebrow">Step 4</span>
                      <h2>Set up your questions</h2>

                    </div>
                    <div className="question-studio">
                      <div className="question-studio__header">
                        <div className="question-mode-strip">
                          {[
                            { value: "general", title: "General questions" },
                            { value: "ai", title: "AI-generated questions" },
                            { value: "custom", title: "Custom questions" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`question-mode-button${draft.questionMode === option.value ? " question-mode-button--active" : ""}`}
                              onClick={() => setMode(option.value as SubmissionDraft["questionMode"])}
                            >
                              <span>{option.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {isEditableQuestionMode ? (
                        <div className="question-studio__note">
                          <div className="question-studio__note-copy">
                            <span>{questionModeLabel(draft.questionMode)} questions</span>

                          </div>
                          {draft.questionMode === "general" ? (
                            <button
                              type="button"
                              className="button button--secondary button--small"
                              onClick={refreshQuestions}
                            >
                              <RefreshCcw size={16} />
                              Refresh questions
                            </button>
                          ) : null}
                        </div>
                      ) : null}


                      {aiQuestionNotice ? <div className="callout callout--soft">{aiQuestionNotice}</div> : null}
                      {aiQuestionError ? <div className="callout callout--warning">{aiQuestionError}</div> : null}

                      {draft.questionMode === "ai" && !hasCurrentAiQuestions ? (
                        <div className="question-studio__empty">
                          <h4>Generate 5 tailored questions</h4>
                          <p>
                            We&apos;ll use your app name, platforms, links, description, and tester instructions
                            to draft a focused question set.
                          </p>
                          <button
                            type="button"
                            className="button button--primary"
                            onClick={generateQuestionSet}
                            disabled={aiQuestionStatus === "loading"}
                          >
                            {aiQuestionStatus === "loading" ? (
                              <span className="button__spinner" aria-hidden="true" />
                            ) : (
                              <Sparkles size={16} />
                            )}
                            {aiQuestionStatus === "loading" ? "Generating..." : "Generate Questions"}
                          </button>
                        </div>
                      ) : (
                        <div className="question-list question-list--studio">
                          {displayedQuestions.map((question, index) => (
                            <article
                              key={question.id}
                              ref={(element) => {
                                questionCardRefs.current[question.id] = element;
                              }}
                              className="question-card question-card--studio"
                            >
                              {isEditableQuestionMode ? (
                                <div className="question-card__topbar">
                                  <div className="question-card__meta question-card__meta--editor">
                                    <button
                                      type="button"
                                      className="icon-button"
                                      onClick={() => removeQuestion(index)}
                                      aria-label="Remove question"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              <div className="question-card__body">
                                {isEditableQuestionMode ? (
                                  <div className="question-card__prompt-row">
                                    <input
                                      className="question-card__prompt-input"
                                      value={question.title}
                                      onChange={(event) => updateQuestion(index, { title: event.target.value })}
                                      placeholder="Type your question here"
                                    />
                                  </div>
                                ) : (
                                  <h4>{question.title}</h4>
                                )}
                                {question.type === "multiple" ? (
                                  isEditableQuestionMode ? (
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
                                              updateQuestion(index, { options: nextOptions });
                                            }}
                                            placeholder={`Option ${optionIndex + 1}`}
                                          />
                                          <button
                                            type="button"
                                            className="option-input-row__remove"
                                            onClick={() => {
                                              const nextOptions = (question.options ?? []).filter((_, currentIndex) => currentIndex !== optionIndex);
                                              updateQuestion(index, { options: nextOptions });
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
                                    <div className="option-grid">
                                      {(question.options ?? []).map((option) => (
                                        <span key={`${question.id}-${option}`} className="option-pill">
                                          {option}
                                        </span>
                                      ))}
                                    </div>
                                  )
                                ) : (
                                  <div className="question-card__response-preview">
                                    <span>{isEditableQuestionMode ? "Written answer" : "Open response"}</span>
                                    <p>Testers will leave written feedback here.</p>
                                  </div>
                                )}
                              </div>
                              {isEditableQuestionMode && question.type === "multiple" ? (
                                <div className="question-card__custom-actions">
                                  {(question.options?.length ?? 0) < 6 ? (
                                    <button
                                      type="button"
                                      className="button button--ghost"
                                      onClick={() =>
                                        updateQuestion(index, {
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
                                    onClick={() => duplicateQuestion(index)}
                                    disabled={hasReachedEditableQuestionLimit}
                                  >
                                    Duplicate
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      )}

                      {isEditableQuestionMode ? (
                        <div className="question-studio__footer">
                          <div className="inline-actions inline-actions--compact">
                            <button
                              type="button"
                              className="button button--secondary"
                              onClick={() => addQuestion("multiple")}
                              disabled={hasReachedEditableQuestionLimit}
                            >
                              <Plus size={16} />
                              Add multiple choice
                            </button>
                            <button
                              type="button"
                              className="button button--secondary"
                              onClick={() => addQuestion("paragraph")}
                              disabled={hasReachedEditableQuestionLimit}
                            >
                              <Plus size={16} />
                              Add paragraph question
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {currentStep === 4 ? (
                  <div className="form-stack">
                    <div className="section-heading">
                      <span className="eyebrow">Step 5</span>
                      <h2>Review before publishing</h2>
                    </div>
                    <div className="review-grid review-grid--single">
                      <div className="review-card review-card--highlight">
                        <span className="eyebrow">Submission</span>
                        <div className="review-edit-list">
                          <button
                            type="button"
                            className="review-edit-row review-edit-row--title"
                            onClick={() => jumpToStep(0)}
                          >
                            <span className="review-edit-row__copy">
                              <span className="review-edit-row__label">App name</span>
                              <strong>{draft.productName}</strong>
                            </span>
                            <ArrowRight size={16} />
                          </button>
                          <button type="button" className="review-edit-row" onClick={() => jumpToStep(1)}>
                            <span className="review-edit-row__copy">
                              <span className="review-edit-row__label">Platforms</span>
                              {draft.productTypes.length > 0 ? (
                        <strong>{productTypesLabel(draft.productTypes)}</strong>
                      ) : (
                        <strong>Select at least one platform</strong>
                      )}
                            </span>
                            <ArrowRight size={16} />
                          </button>
                          <button type="button" className="review-edit-row" onClick={() => jumpToStep(2)}>
                            <span className="review-edit-row__copy">
                              <span className="review-edit-row__label">Links</span>
                              <strong>
                                {accessLinksSummaryText ||
                                  (selectedProductTypes.length > 1
                                    ? "Add a link for each selected platform"
                                    : "Add your live app link")}
                              </strong>
                            </span>
                            <ArrowRight size={16} />
                          </button>
                          <button type="button" className="review-edit-row" onClick={() => jumpToStep(3)}>
                            <span className="review-edit-row__copy">
                              <span className="review-edit-row__label">Question type</span>
                              <strong>{questionTypeLabel(draft.questionMode)}</strong>
                            </span>
                            <ArrowRight size={16} />
                          </button>
                          {draft.instructions.trim() ? (
                            <button type="button" className="review-edit-row" onClick={() => jumpToStep(2)}>
                              <span className="review-edit-row__copy">
                                <span className="review-edit-row__label">Tester instructions</span>
                                <strong>{draft.instructions}</strong>
                              </span>
                              <ArrowRight size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? <div className="callout callout--warning">{error}</div> : null}

                <div className="wizard-actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                    disabled={currentStep === 0 || isSubmitting}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void goNext()}
                    disabled={isSubmitting || (draft.questionMode === "ai" && !hasCurrentAiQuestions)}
                  >
                    {currentStep === 4 ? "Submit my app" : "Continue"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Surface>
            </div>
          </div>
        ) : (
          <VerificationFlowShell title="Your app has been submitted">
            <span className="eyebrow">Submitted</span>
            <h2>{currentUser ? "Your app has been submitted." : "Verify your email"}</h2>
            <p>
              Congrats on submitting another app! Go earn credits or view your tests to see how they&apos;re doing
            </p>
            {!currentUser ? (
              <div className="form-stack form-stack--narrow form-stack--verification">
                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={sendOtp}
                  disabled={isSendingCode || !email.trim() || !submissionId}
                >
                  {isSendingCode ? (
                    <span className="button__spinner" aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {isSendingCode ? "Sending..." : "Send one-time code"}
                </button>
              </div>
            ) : (
              <div className="inline-actions">
                <button type="button" className="button button--primary" onClick={() => navigate("/earn")}>
                  Go to Earn
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => navigate("/my-tests")}
                >
                  View My Tests
                </button>
              </div>
            )}
          </VerificationFlowShell>
        )}
      </div>
    </AppShell>
  );
}











