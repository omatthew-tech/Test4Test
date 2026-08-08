import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  FormSummary,
  IconButton,
  Select,
  Surface,
  Test4TestBrand,
  Textarea,
  TextField,
  type FormSummaryItem,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { StepIndicator } from "../components/StepIndicator";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import { trackEvent, trackEventOncePerSession } from "../lib/analytics";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  getOrderedAccessLinks,
  normalizeAccessLinks,
  productTypesFromAccessLinks,
} from "../lib/format";
import {
  MAX_INSTRUCTION_STEPS,
  normalizeInstructionSteps,
  serializeInstructionSteps,
} from "../lib/instructions";
import {
  clearSubmitFlowResume,
  getStoredOtpChallenge,
  getSubmitFlowResume,
  saveSubmitFlowResume,
  SubmitFlowResumePhase,
} from "../lib/pendingSubmission";
import { validateAccessLink } from "../lib/questions";
import { wait } from "../lib/timing";
import { AccessLinks, SubmissionDraft } from "../types";
import styles from "./SubmitFlowPage.module.css";

const steps = ["App name", "App links", "Instructions"];
const REVIEW_STEP = steps.length;
const COMPLETE_STEP = REVIEW_STEP + 1;
const additionalLinkKinds = ["ios", "android", "figma", "other"] as const;

type AdditionalLinkKind = (typeof additionalLinkKinds)[number];

const additionalLinkLabels: Record<AdditionalLinkKind, string> = {
  ios: "iOS app",
  android: "Android app",
  figma: "Figma",
  other: "Other",
};

interface InitialSubmitFlowState {
  flowPhase: SubmitFlowResumePhase;
  currentStep: number;
  submissionId: string | null;
  email: string;
  draft: SubmissionDraft;
}

function createDefaultDraft(productName: string): SubmissionDraft {
  return {
    productName,
    productTypes: ["website"],
    description: "",
    targetAudience: "",
    instructions: "",
    instructionSteps: [""],
    googlePlayClosedTestInstructions: "",
    accessLinks: { website: "" },
    requiresRecording: true,
    needsGooglePlayClosedTesters: false,
    questionMode: "general",
  };
}

function preserveDraftAccessLinks(value: unknown): AccessLinks {
  const normalized = normalizeAccessLinks(value);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { website: normalized.website ?? "" };
  }

  const source = value as Record<string, unknown>;
  const preserved: AccessLinks = { ...normalized, website: normalized.website ?? "" };

  additionalLinkKinds.forEach((kind) => {
    if (!(kind in source)) return;

    if (kind === "other") {
      const other = source.other;
      if (other && typeof other === "object" && !Array.isArray(other)) {
        const candidate = other as Record<string, unknown>;
        preserved.other = {
          label: typeof candidate.label === "string" ? candidate.label : "",
          url: typeof candidate.url === "string" ? candidate.url : "",
        };
      }
      return;
    }

    if (typeof source[kind] === "string") {
      preserved[kind] = source[kind];
    }
  });

  return preserved;
}

function normalizeResumeDraft(draft: SubmissionDraft): SubmissionDraft {
  const accessLinks = preserveDraftAccessLinks(draft.accessLinks);
  const normalizedSteps = normalizeInstructionSteps(draft.instructionSteps, draft.instructions);
  const instructionSteps = normalizedSteps.length > 0 ? normalizedSteps : [""];

  return {
    ...createDefaultDraft(draft.productName ?? ""),
    ...draft,
    accessLinks,
    productTypes: productTypesFromAccessLinks(accessLinks),
    instructions: serializeInstructionSteps(instructionSteps),
    instructionSteps,
    requiresRecording: true,
    needsGooglePlayClosedTesters: false,
    googlePlayClosedTestInstructions: "",
    questionMode: "general",
  };
}

function getLegacyResumeStep(draft: SubmissionDraft) {
  if (!draft.productName.trim()) return 0;
  if (!draft.accessLinks.website?.trim()) return 1;
  if (!draft.instructionSteps.some((step) => step.trim())) return 2;
  return REVIEW_STEP;
}

function getInitialSubmitFlowState(
  initialProductName: string,
  resumeVerifyEmail: boolean,
  initialEmail: string,
  initialSubmissionId: string | null,
): InitialSubmitFlowState {
  const resumeState = getSubmitFlowResume();
  const challenge = getStoredOtpChallenge();
  const defaultDraft = createDefaultDraft(initialProductName);

  if (!resumeState && challenge?.submissionId) {
    return {
      flowPhase: resumeVerifyEmail ? "email" : "verify-code",
      currentStep: COMPLETE_STEP,
      submissionId: initialSubmissionId ?? challenge.submissionId,
      email: initialEmail || challenge.email,
      draft: defaultDraft,
    };
  }

  if (!resumeState) {
    return {
      flowPhase: resumeVerifyEmail ? "email" : "wizard",
      currentStep: resumeVerifyEmail ? COMPLETE_STEP : 0,
      submissionId: initialSubmissionId,
      email: initialEmail,
      draft: defaultDraft,
    };
  }

  const flowPhase = resumeVerifyEmail
    ? "email"
    : resumeState.phase === "verify-code" && !challenge?.submissionId
      ? "email"
      : resumeState.phase;
  const draft = normalizeResumeDraft(resumeState.draft);
  const resumedStep =
    resumeState.version === 1
      ? getLegacyResumeStep(draft)
      : Math.min(Math.max(resumeState.currentStep, 0), REVIEW_STEP);

  return {
    flowPhase,
    currentStep: flowPhase === "wizard" ? resumedStep : COMPLETE_STEP,
    submissionId: initialSubmissionId ?? challenge?.submissionId ?? resumeState.submissionId,
    email: initialEmail || challenge?.email || resumeState.email,
    draft,
  };
}

export function SubmitFlowPage() {
  const [searchParams] = useSearchParams();
  const initialProductName = searchParams.get("productName") ?? "";
  const resumeVerifyEmail = searchParams.get("phase") === "verify-email";
  const initialEmail = searchParams.get("email") ?? "";
  const initialSubmissionId = searchParams.get("submissionId");
  const navigate = useNavigate();
  const { state, currentUser, createSubmission, requestOtp } = useAppState();
  const initialStateRef = useRef<InitialSubmitFlowState | null>(null);
  const formSummaryRef = useRef<HTMLDivElement | null>(null);
  const hasTrackedSubmitProductNameRef = useRef(false);

  if (!initialStateRef.current) {
    initialStateRef.current = getInitialSubmitFlowState(
      initialProductName,
      resumeVerifyEmail,
      initialEmail,
      initialSubmissionId,
    );
  }

  const initialState = initialStateRef.current;
  const [flowPhase, setFlowPhase] = useState<SubmitFlowResumePhase>(initialState.flowPhase);
  const [currentStep, setCurrentStep] = useState(initialState.currentStep);
  const [submissionId, setSubmissionId] = useState<string | null>(initialState.submissionId);
  const [email, setEmail] = useState(initialState.email);
  const [draft, setDraft] = useState(initialState.draft);
  const [formErrors, setFormErrors] = useState<FormSummaryItem[]>([]);
  const [selectedAdditionalKind, setSelectedAdditionalKind] = useState<AdditionalLinkKind>("ios");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [pausedLiveSubmissionName, setPausedLiveSubmissionName] = useState("");

  const orderedAccessLinks = useMemo(
    () => getOrderedAccessLinks(draft.accessLinks, productTypesFromAccessLinks(draft.accessLinks)),
    [draft.accessLinks],
  );
  const activeAdditionalKinds = useMemo(
    () => additionalLinkKinds.filter((kind) => draft.accessLinks[kind] !== undefined),
    [draft.accessLinks],
  );
  const availableAdditionalKinds = useMemo(
    () => additionalLinkKinds.filter((kind) => !activeAdditionalKinds.includes(kind)),
    [activeAdditionalKinds],
  );
  const currentLiveSubmission = useMemo(
    () =>
      currentUser
        ? (state.submissions.find(
            (submission) =>
              submission.userId === currentUser.id &&
              submission.status === "live" &&
              submission.id !== submissionId,
          ) ?? null)
        : null,
    [currentUser, state.submissions, submissionId],
  );
  const ownedSubmissionCount = useMemo(
    () =>
      currentUser
        ? state.submissions.filter((submission) => submission.userId === currentUser.id).length
        : 0,
    [currentUser, state.submissions],
  );
  const submitSuccessMessage = pausedLiveSubmissionName
    ? `${draft.productName || "Your app"} is now live. ${pausedLiveSubmissionName} was paused so only one test appears on Earn at a time.`
    : !currentUser || ownedSubmissionCount <= 1
      ? "Congrats on submitting your first app! You're helping other founders, like yourself, make better apps."
      : "Congrats on submitting another app! Go earn credits or view your tests to see how they're doing";

  useEffect(() => {
    if (currentStep > REVIEW_STEP) return;

    trackEventOncePerSession(
      "submit_step_viewed",
      {
        stepIndex: currentStep,
        stepName: currentStep === REVIEW_STEP ? "Review" : steps[currentStep],
      },
      `submit_step_viewed:v2:${currentStep}`,
    );
  }, [currentStep]);

  const hasResumeData =
    currentStep > 0 ||
    flowPhase !== "wizard" ||
    Boolean(submissionId) ||
    Boolean(email.trim()) ||
    Boolean(draft.productName.trim()) ||
    Boolean(draft.description.trim()) ||
    Boolean(draft.accessLinks.website?.trim()) ||
    activeAdditionalKinds.length > 0 ||
    draft.instructionSteps.some((step) => step.trim());

  useEffect(() => {
    if (resumeVerifyEmail || flowPhase !== "verify-code") return;

    const challenge = getStoredOtpChallenge();
    const nextSubmissionId = submissionId ?? challenge?.submissionId ?? null;
    const nextEmail = email.trim() || challenge?.email || "";

    if (!challenge?.submissionId || !challenge.email || !nextSubmissionId || !nextEmail) {
      setFlowPhase("email");
      return;
    }

    navigate(
      `/verify?email=${encodeURIComponent(nextEmail)}&submissionId=${encodeURIComponent(nextSubmissionId)}`,
      { replace: true },
    );
  }, [email, flowPhase, navigate, resumeVerifyEmail, submissionId]);

  useEffect(() => {
    if (currentUser && currentStep === COMPLETE_STEP && submissionId) {
      clearSubmitFlowResume();
      return;
    }

    if (!hasResumeData) {
      clearSubmitFlowResume();
      return;
    }

    saveSubmitFlowResume({
      phase: currentStep <= REVIEW_STEP ? "wizard" : flowPhase,
      currentStep,
      draft,
      generalQuestions: [],
      customQuestions: [],
      aiQuestions: [],
      hasGeneratedGeneralQuestions: false,
      aiQuestionStatus: "idle",
      aiQuestionError: "",
      aiQuestionNotice: "",
      aiQuestionSourceKey: null,
      submissionId,
      email,
      updatedAt: new Date().toISOString(),
    });
  }, [currentStep, draft, email, flowPhase, hasResumeData, submissionId, currentUser]);

  useEffect(() => {
    if (
      availableAdditionalKinds.length > 0 &&
      !availableAdditionalKinds.includes(selectedAdditionalKind)
    ) {
      setSelectedAdditionalKind(availableAdditionalKinds[0]);
    }
  }, [availableAdditionalKinds, selectedAdditionalKind]);

  const clearErrors = () => setFormErrors([]);

  const updateDraft = (next: Partial<SubmissionDraft>) => {
    clearErrors();
    setDraft((current) => ({ ...current, ...next }));
  };

  const updateAccessLinks = (nextAccessLinks: AccessLinks) => {
    clearErrors();
    setDraft((current) => ({
      ...current,
      accessLinks: nextAccessLinks,
      productTypes: productTypesFromAccessLinks(nextAccessLinks),
    }));
  };

  const updateInstructionStep = (index: number, value: string) => {
    clearErrors();
    setDraft((current) => {
      const instructionSteps = current.instructionSteps.map((step, stepIndex) =>
        stepIndex === index ? value : step,
      );
      return {
        ...current,
        instructionSteps,
        instructions: serializeInstructionSteps(instructionSteps),
      };
    });
  };

  const addInstructionStep = () => {
    if (draft.instructionSteps.length >= MAX_INSTRUCTION_STEPS) return;

    const nextIndex = draft.instructionSteps.length;
    clearErrors();
    setDraft((current) => ({
      ...current,
      instructionSteps: [...current.instructionSteps, ""],
    }));
    window.requestAnimationFrame(() =>
      document.getElementById(`instruction-step-${nextIndex}`)?.focus(),
    );
  };

  const removeInstructionStep = (index: number) => {
    clearErrors();
    setDraft((current) => {
      const instructionSteps = current.instructionSteps.filter(
        (_, stepIndex) => stepIndex !== index,
      );
      return {
        ...current,
        instructionSteps,
        instructions: serializeInstructionSteps(instructionSteps),
      };
    });
  };

  const addAdditionalLink = () => {
    if (!availableAdditionalKinds.includes(selectedAdditionalKind)) return;

    const nextAccessLinks: AccessLinks = { ...draft.accessLinks };
    if (selectedAdditionalKind === "other") {
      nextAccessLinks.other = { label: "", url: "" };
    } else {
      nextAccessLinks[selectedAdditionalKind] = "";
    }
    updateAccessLinks(nextAccessLinks);
    window.requestAnimationFrame(() => {
      const targetId =
        selectedAdditionalKind === "other" ? "other-link-label" : `${selectedAdditionalKind}-link`;
      document.getElementById(targetId)?.focus();
    });
  };

  const removeAdditionalLink = (kind: AdditionalLinkKind) => {
    const nextAccessLinks = { ...draft.accessLinks };
    delete nextAccessLinks[kind];
    updateAccessLinks(nextAccessLinks);
  };

  const getFieldError = (fieldId: string) =>
    formErrors.find((item) => item.fieldId === fieldId)?.message;

  const validateStep = (step: number): FormSummaryItem[] => {
    if (step === 0) {
      return draft.productName.trim()
        ? []
        : [{ fieldId: "app-name", message: "Add an app name to continue." }];
    }

    if (step === 1) {
      const errors: FormSummaryItem[] = [];
      const website = draft.accessLinks.website ?? "";
      const websiteValidation = validateAccessLink(website, "website");

      if (!website.trim() || !websiteValidation.valid) {
        errors.push({
          fieldId: "website-link",
          message: website.trim()
            ? websiteValidation.message
            : "Add a public website link for testers.",
        });
      }

      activeAdditionalKinds.forEach((kind) => {
        if (kind === "other") {
          if (!draft.accessLinks.other?.label.trim()) {
            errors.push({ fieldId: "other-link-label", message: "Add a name for the Other link." });
          }
          const url = draft.accessLinks.other?.url ?? "";
          const validation = validateAccessLink(url, "other");
          if (!url.trim() || !validation.valid) {
            errors.push({
              fieldId: "other-link",
              message: url.trim() ? validation.message : "Add a public URL for the Other link.",
            });
          }
          return;
        }

        const url = draft.accessLinks[kind] ?? "";
        const validation = validateAccessLink(url, kind);
        if (!url.trim() || !validation.valid) {
          errors.push({
            fieldId: `${kind}-link`,
            message: url.trim()
              ? validation.message
              : `Add a public ${additionalLinkLabels[kind]} link or remove this field.`,
          });
        }
      });

      return errors;
    }

    if (step === 2) {
      return draft.instructionSteps.flatMap((instruction, index) =>
        instruction.trim()
          ? []
          : [
              {
                fieldId: `instruction-step-${index}`,
                message: `Add a task for Step ${index + 1} or remove it.`,
              },
            ],
      );
    }

    return [];
  };

  const showValidation = (errors: FormSummaryItem[]) => {
    setFormErrors(errors);
    window.requestAnimationFrame(() => formSummaryRef.current?.focus());
  };

  const jumpToStep = (step: number) => {
    clearErrors();
    setFlowPhase("wizard");
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    if (currentStep === REVIEW_STEP) {
      jumpToStep(2);
      return;
    }

    jumpToStep(Math.max(0, currentStep - 1));
  };

  const submitDraft = async () => {
    for (let step = 0; step < steps.length; step += 1) {
      const errors = validateStep(step);
      if (errors.length > 0) {
        setCurrentStep(step);
        showValidation(errors);
        return;
      }
    }

    setIsSubmitting(true);
    clearErrors();

    try {
      const replacedLiveSubmissionName = currentLiveSubmission?.productName ?? "";
      const instructionSteps = draft.instructionSteps.map((step) => step.trim());
      const finalDraft: SubmissionDraft = {
        ...draft,
        productTypes: productTypesFromAccessLinks(draft.accessLinks),
        instructions: serializeInstructionSteps(instructionSteps),
        instructionSteps,
        requiresRecording: true,
        needsGooglePlayClosedTesters: false,
        googlePlayClosedTestInstructions: "",
        questionMode: "general",
      };
      const createdId = await createSubmission(finalDraft);
      setDraft(finalDraft);
      setSubmissionId(createdId);
      setPausedLiveSubmissionName(replacedLiveSubmissionName);
      setFlowPhase("email");
      setCurrentStep(COMPLETE_STEP);
    } catch (submissionError) {
      showValidation([
        {
          fieldId: "submit-app",
          message:
            submissionError instanceof Error
              ? submissionError.message
              : "The submission could not be saved.",
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    if (currentStep === REVIEW_STEP) {
      void submitDraft();
      return;
    }

    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      showValidation(errors);
      return;
    }

    if (currentStep === 0 && !hasTrackedSubmitProductNameRef.current) {
      hasTrackedSubmitProductNameRef.current = true;
      trackEvent("product_name_entered", { source: "submit_flow" });
    }

    clearErrors();
    setCurrentStep((step) => Math.min(step + 1, REVIEW_STEP));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sendOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !submissionId) {
      showValidation([
        {
          fieldId: "verification-email",
          message: "Add an email so we can send the one-time code.",
        },
      ]);
      return;
    }

    clearErrors();
    setEmail(normalizedEmail);
    setIsSendingCode(true);

    try {
      await Promise.all([requestOtp(normalizedEmail, submissionId), wait(5000)]);
      setFlowPhase("verify-code");
      navigate(
        `/verify?email=${encodeURIComponent(normalizedEmail)}&submissionId=${encodeURIComponent(submissionId)}`,
      );
    } catch (otpError) {
      showValidation([
        {
          fieldId: "verification-email",
          message:
            otpError instanceof Error ? otpError.message : "We could not send a verification code.",
        },
      ]);
    } finally {
      setIsSendingCode(false);
    }
  };

  return (
    <AppShell eyebrowLabel={null} hideSiteHeader contentWidth="viewport">
      <div className={styles.layout}>
        <div className={styles.brand}>
          <Test4TestBrand />
        </div>

        <div className={styles.page}>
          {currentStep <= REVIEW_STEP ? (
            <div className={styles.wizard}>
              {currentStep < REVIEW_STEP ? (
                <StepIndicator steps={steps} currentStep={currentStep} />
              ) : null}

              <Surface className={styles.stage}>
                {currentStep === 0 ? (
                  <div className={styles.stack}>
                    <div className={styles.heading}>
                      <h1>What&apos;s the name of your app?</h1>
                    </div>
                    <TextField
                      id="app-name"
                      label="App name"
                      value={draft.productName}
                      onChange={(event) => updateDraft({ productName: event.target.value })}
                      placeholder="Palette Pilot"
                      error={getFieldError("app-name")}
                      required
                    />
                    <Textarea
                      id="app-description"
                      label="Short app description visible to testers (optional)"
                      rows={4}
                      value={draft.description}
                      onChange={(event) => updateDraft({ description: event.target.value })}
                      placeholder="Write something interesting to catch a tester's attention, such as how Palette Pilot helps teams shape ideas faster."
                    />
                  </div>
                ) : null}

                {currentStep === 1 ? (
                  <div className={styles.stack}>
                    <div className={styles.heading}>
                      <h1>Where can testers open your app?</h1>
                      <p>
                        Add your website, then include any other links that help testers complete
                        the task.
                      </p>
                    </div>
                    <TextField
                      id="website-link"
                      type="url"
                      label="Website / Web app link"
                      value={draft.accessLinks.website ?? ""}
                      onChange={(event) =>
                        updateAccessLinks({ ...draft.accessLinks, website: event.target.value })
                      }
                      placeholder={accessLinkPlaceholder("website")}
                      error={getFieldError("website-link")}
                      required
                    />

                    {activeAdditionalKinds.map((kind) => {
                      if (kind === "other") {
                        return (
                          <div className={styles.linkRow} key={kind}>
                            <div className={styles.linkFields}>
                              <TextField
                                id="other-link-label"
                                label="Other link name"
                                value={draft.accessLinks.other?.label ?? ""}
                                onChange={(event) =>
                                  updateAccessLinks({
                                    ...draft.accessLinks,
                                    other: {
                                      label: event.target.value,
                                      url: draft.accessLinks.other?.url ?? "",
                                    },
                                  })
                                }
                                placeholder="Interactive prototype"
                                error={getFieldError("other-link-label")}
                                required
                              />
                              <TextField
                                id="other-link"
                                type="url"
                                label="Other link URL"
                                value={draft.accessLinks.other?.url ?? ""}
                                onChange={(event) =>
                                  updateAccessLinks({
                                    ...draft.accessLinks,
                                    other: {
                                      label: draft.accessLinks.other?.label ?? "",
                                      url: event.target.value,
                                    },
                                  })
                                }
                                placeholder={accessLinkPlaceholder("other")}
                                error={getFieldError("other-link")}
                                required
                              />
                            </div>
                            <IconButton
                              type="button"
                              label="Remove Other link"
                              variant="danger"
                              onClick={() => removeAdditionalLink(kind)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        );
                      }

                      return (
                        <div className={styles.linkRow} key={kind}>
                          <div className={styles.linkFields}>
                            <TextField
                              id={`${kind}-link`}
                              type="url"
                              label={accessLinkFieldLabel(kind)}
                              value={draft.accessLinks[kind] ?? ""}
                              onChange={(event) =>
                                updateAccessLinks({
                                  ...draft.accessLinks,
                                  [kind]: event.target.value,
                                })
                              }
                              placeholder={accessLinkPlaceholder(kind)}
                              error={getFieldError(`${kind}-link`)}
                              required
                            />
                          </div>
                          <IconButton
                            type="button"
                            label={`Remove ${additionalLinkLabels[kind]} link`}
                            variant="danger"
                            onClick={() => removeAdditionalLink(kind)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      );
                    })}

                    {availableAdditionalKinds.length > 0 ? (
                      <div className={styles.addLink}>
                        <Select
                          label="Additional link type"
                          value={selectedAdditionalKind}
                          onChange={(event) =>
                            setSelectedAdditionalKind(event.target.value as AdditionalLinkKind)
                          }
                        >
                          {availableAdditionalKinds.map((kind) => (
                            <option key={kind} value={kind}>
                              {additionalLinkLabels[kind]}
                            </option>
                          ))}
                        </Select>
                        <Button type="button" variant="secondary" onClick={addAdditionalLink}>
                          <Plus size={16} />
                          Add another link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {currentStep === 2 ? (
                  <div className={styles.stack}>
                    <div className={styles.heading}>
                      <h1>Add instructions</h1>
                      <p>
                        Give testers a set of task(s) while they think out loud. This should take
                        around 5-10 minutes to complete.
                      </p>
                    </div>
                    <div className={styles.instructionList}>
                      {draft.instructionSteps.map((instruction, index) => (
                        <div className={styles.instructionRow} key={`instruction-${index}`}>
                          <div className={styles.instructionField}>
                            <Textarea
                              id={`instruction-step-${index}`}
                              label={`Step ${index + 1}`}
                              rows={3}
                              value={instruction}
                              onChange={(event) => updateInstructionStep(index, event.target.value)}
                              placeholder={
                                index === 0
                                  ? "Browse the home page and tell us what you think the app does."
                                  : "Describe the next task for the tester."
                              }
                              error={getFieldError(`instruction-step-${index}`)}
                              required
                            />
                          </div>
                          {index > 0 ? (
                            <IconButton
                              type="button"
                              label={`Remove Step ${index + 1}`}
                              variant="danger"
                              onClick={() => removeInstructionStep(index)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {draft.instructionSteps.length < MAX_INSTRUCTION_STEPS ? (
                      <Button type="button" variant="secondary" onClick={addInstructionStep}>
                        <Plus size={16} />
                        Add another step
                      </Button>
                    ) : (
                      <Alert>Five steps is the maximum for a focused tester task.</Alert>
                    )}
                  </div>
                ) : null}

                {currentStep === REVIEW_STEP ? (
                  <div className={styles.stack}>
                    <div className={styles.heading}>
                      <h1>Review before publishing</h1>
                      <p>Check the three sections below, then submit your app.</p>
                    </div>
                    {currentLiveSubmission ? (
                      <Alert>
                        Submitting this app will make it your live Earn test and pause{" "}
                        {currentLiveSubmission.productName}.
                      </Alert>
                    ) : null}
                    <div className={styles.reviewList}>
                      <section className={styles.reviewSection} aria-labelledby="review-app-name">
                        <div className={styles.reviewHeader}>
                          <div>
                            <span>1</span>
                            <h3 id="review-app-name">App name</h3>
                          </div>
                          <Button
                            type="button"
                            variant="quiet"
                            size="compact"
                            onClick={() => jumpToStep(0)}
                          >
                            <Pencil size={16} />
                            Edit
                          </Button>
                        </div>
                        <strong>{draft.productName}</strong>
                        {draft.description.trim() ? <p>{draft.description}</p> : null}
                      </section>
                      <section className={styles.reviewSection} aria-labelledby="review-app-links">
                        <div className={styles.reviewHeader}>
                          <div>
                            <span>2</span>
                            <h3 id="review-app-links">App links</h3>
                          </div>
                          <Button
                            type="button"
                            variant="quiet"
                            size="compact"
                            onClick={() => jumpToStep(1)}
                          >
                            <Pencil size={16} />
                            Edit
                          </Button>
                        </div>
                        <ul className={styles.resourceList}>
                          {orderedAccessLinks.map((link) => (
                            <li key={link.kind}>
                              <strong>{link.label}</strong>
                              <span>{link.displayUrl}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section
                        className={styles.reviewSection}
                        aria-labelledby="review-instructions"
                      >
                        <div className={styles.reviewHeader}>
                          <div>
                            <span>3</span>
                            <h3 id="review-instructions">Instructions</h3>
                          </div>
                          <Button
                            type="button"
                            variant="quiet"
                            size="compact"
                            onClick={() => jumpToStep(2)}
                          >
                            <Pencil size={16} />
                            Edit
                          </Button>
                        </div>
                        <ol className={styles.taskList}>
                          {draft.instructionSteps.map((instruction, index) => (
                            <li key={`review-instruction-${index}`}>{instruction}</li>
                          ))}
                        </ol>
                      </section>
                    </div>
                  </div>
                ) : null}

                <FormSummary ref={formSummaryRef} items={formErrors} title="Check this step" />

                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={goBack}
                    disabled={currentStep === 0 || isSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    id="submit-app"
                    type="button"
                    onClick={goNext}
                    loading={isSubmitting}
                    loadingLabel="Submitting app..."
                  >
                    {currentStep === REVIEW_STEP ? "Submit my app" : "Continue"}
                    {!isSubmitting ? <ArrowRight size={16} /> : null}
                  </Button>
                </div>
              </Surface>
            </div>
          ) : (
            <VerificationFlowShell title="Your app has been submitted">
              <h2>
                {currentUser
                  ? "Your app has been submitted."
                  : "Verify your email to start receiving feedback"}
              </h2>
              <p>{submitSuccessMessage}</p>
              {!currentUser ? (
                <div className={styles.verificationForm}>
                  <TextField
                    id="verification-email"
                    type="email"
                    label="Email address"
                    value={email}
                    onChange={(event) => {
                      clearErrors();
                      setEmail(event.target.value);
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    error={getFieldError("verification-email")}
                    required
                  />
                  <FormSummary ref={formSummaryRef} items={formErrors} title="Check your email" />
                  <Button
                    type="button"
                    onClick={() => void sendOtp()}
                    loading={isSendingCode}
                    loadingLabel="Sending..."
                    disabled={!email.trim() || !submissionId}
                  >
                    {!isSendingCode ? <Sparkles size={16} /> : null}
                    Send one-time code
                  </Button>
                </div>
              ) : (
                <div className={styles.successActions}>
                  <Button type="button" onClick={() => navigate("/earn")}>
                    Go to Earn
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate("/my-tests")}>
                    View My Tests
                  </Button>
                </div>
              )}
            </VerificationFlowShell>
          )}
        </div>
      </div>
    </AppShell>
  );
}
