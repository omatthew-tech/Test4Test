import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Inbox, Mic, Share2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { GooglePlayClosedTestOption } from "../components/GooglePlayClosedTestOption";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  formatDate,
  getOrderedAccessLinks,
  PRODUCT_TYPE_ORDER,
  normalizeProductTypes,
  productTypeLabel,
} from "../lib/format";
import { getActiveQuestionSet, getMySubmissions } from "../lib/selectors";
import { validateAccessLink } from "../lib/questions";
import { ProductType, QuestionSetVersion, Submission, SubmissionDraft, SubmissionStatus } from "../types";

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

function buildEditDraft(submission: Submission): SubmissionDraft {
  return {
    productName: submission.productName,
    productTypes: [...submission.productTypes],
    description: submission.description,
    targetAudience: submission.targetAudience,
    instructions: submission.instructions,
    googlePlayClosedTestInstructions: submission.googlePlayClosedTestInstructions,
    accessLinks: { ...submission.accessLinks },
    requiresRecording: submission.requiresRecording,
    needsGooglePlayClosedTesters: submission.needsGooglePlayClosedTesters,
    questionMode: submission.questionMode,
  };
}

const productTypeOptions: Array<{ value: ProductType; title: string }> = PRODUCT_TYPE_ORDER.map((value) => ({
  value,
  title: productTypeLabel(value),
}));

function buildShareUrl(submissionId: string) {
  if (typeof window === "undefined") {
    return `/test/${submissionId}?shared=1`;
  }

  return `${window.location.origin}/test/${submissionId}?shared=1`;
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
  const { state, updateSubmissionDetails } = useAppState();
  const submissions = getMySubmissions(state);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SubmissionDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [sharingSubmissionId, setSharingSubmissionId] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState("");

  const selectedEditProductTypes = useMemo(
    () => normalizeProductTypes(editDraft?.productTypes ?? []),
    [editDraft?.productTypes],
  );
  const showEditGooglePlayClosedTestOption =
    selectedEditProductTypes.includes("android") || editDraft?.needsGooglePlayClosedTesters === true;
  const isEditGooglePlayClosedTestLocked = editDraft?.needsGooglePlayClosedTesters === true;

  const sharingSubmission = useMemo(
    () => submissions.find((submission) => submission.id === sharingSubmissionId) ?? null,
    [sharingSubmissionId, submissions],
  );
  const sharingQuestionSet = sharingSubmission
    ? getActiveQuestionSet(state, sharingSubmission.id)
    : null;
  const sharingUrl = sharingSubmission ? buildShareUrl(sharingSubmission.id) : "";
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
    setEditDraft(buildEditDraft(submission));
    setEditError("");
  };

  const closeEditTest = () => {
    if (isSavingEdit) {
      return;
    }

    setEditingSubmissionId(null);
    setEditDraft(null);
    setEditError("");
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

  const copyShareUrl = async () => {
    if (!sharingUrl) {
      return;
    }

    const copied = await copyTextToClipboard(sharingUrl);
    setShareCopyStatus(copied ? "Copied" : "Copy failed");
  };

  const updateEditDraft = (next: Partial<SubmissionDraft>) => {
    setEditError("");
    setEditDraft((current) => (current ? { ...current, ...next } : current));
  };

  const toggleEditProductType = (productType: ProductType) => {
    setEditError("");
    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      if (current.needsGooglePlayClosedTesters) {
        return current;
      }

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
        needsGooglePlayClosedTesters:
          current.needsGooglePlayClosedTesters && nextProductTypes.includes("android"),
      };
    });
  };

  const setEditGooglePlayClosedTestRequirement = (checked: boolean) => {
    setEditError("");
    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      if (checked) {
        return {
          ...current,
          productTypes: ["android"],
          accessLinks: current.accessLinks.android
            ? { android: current.accessLinks.android }
            : {},
          needsGooglePlayClosedTesters: true,
        };
      }

      return {
        ...current,
        needsGooglePlayClosedTesters: false,
        googlePlayClosedTestInstructions: "",
      };
    });
  };

  const updateEditAccessLink = (productType: ProductType, value: string) => {
    setEditError("");
    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        accessLinks: {
          ...current.accessLinks,
          [productType]: value,
        },
      };
    });
  };

  const validateEditSubmission = () => {
    if (!editDraft) {
      return "This test could not be loaded.";
    }

    if (!editDraft.productName.trim()) {
      return "Add an app name to continue.";
    }

    if (selectedEditProductTypes.length === 0) {
      return "Select at least one app type to continue.";
    }

    if (
      editDraft.needsGooglePlayClosedTesters &&
      (selectedEditProductTypes.length !== 1 || selectedEditProductTypes[0] !== "android")
    ) {
      return "Google Play closed-test matching requires an Android-only submission.";
    }

    for (const productType of selectedEditProductTypes) {
      const value = editDraft.accessLinks[productType] ?? "";
      const validation = validateAccessLink(value, productType);
      const fieldLabel = accessLinkFieldLabel(
        productType,
        editDraft.needsGooglePlayClosedTesters && productType === "android",
      ).toLowerCase();

      if (!value.trim()) {
        return `Add a public ${fieldLabel} for testers.`;
      }

      if (!validation.valid) {
        return `${productTypeLabel(productType)}: ${validation.message}`;
      }
    }

    if (
      editDraft.needsGooglePlayClosedTesters &&
      !editDraft.googlePlayClosedTestInstructions.trim()
    ) {
      return "Add Google Play closed-test access instructions for testers.";
    }

    return "";
  };

  const saveEditTest = async () => {
    if (!editingSubmissionId || !editDraft) {
      return;
    }

    const nextError = validateEditSubmission();

    if (nextError) {
      setEditError(nextError);
      return;
    }

    setIsSavingEdit(true);

    try {
      await updateSubmissionDetails(editingSubmissionId, editDraft);
      setEditingSubmissionId(null);
      setEditDraft(null);
      setEditError("");
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "The test could not be updated.",
      );
    } finally {
      setIsSavingEdit(false);
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
          onCopy={() => void copyShareUrl()}
          onClose={closeShareTest}
        />
      ) : null}

      {editDraft && editingSubmissionId ? (
        <div className="results-modal-backdrop" role="presentation" onClick={closeEditTest}>
          <div
            className="results-modal results-modal--edit-test"
            role="dialog"
            aria-modal="true"
            aria-label="Edit app"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="results-modal__header">
              <div>
                <h2>Edit app</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeEditTest}
                aria-label="Close edit test"
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-stack form-stack--edit-test-modal">
              <div className="edit-test-modal__section">
                <div className="section-heading">
                  <h2>What&apos;s the name of your app?</h2>
                </div>
                <label className="field">
                  <span>App name</span>
                  <input
                    value={editDraft.productName}
                    onChange={(event) => updateEditDraft({ productName: event.target.value })}
                    placeholder="Palette Pilot"
                  />
                </label>
                <label className="field">
                  <span>(optional) Short app description visible to testers</span>
                  <textarea
                    rows={4}
                    value={editDraft.description}
                    onChange={(event) => updateEditDraft({ description: event.target.value })}
                    placeholder="Write something interesting to catch tester's attention i.e. Palette Pilot helps teams shape ideas faster."
                  />
                </label>
              </div>

              <div className="edit-test-modal__section">
                <div className="section-heading">
                  <h2>What kind of app is it?</h2>
                  <p>Choose every platform testers can use right now.</p>
                </div>
                <div className="choice-grid">
                  {productTypeOptions.map((option) => {
                    const isSelected = editDraft.productTypes.includes(option.value);
                    const isDisabled = isEditGooglePlayClosedTestLocked;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`choice-card choice-card--multi${isSelected ? " choice-card--active" : ""}${isDisabled ? " choice-card--disabled" : ""}`}
                        onClick={() => toggleEditProductType(option.value)}
                        aria-pressed={isSelected}
                        disabled={isDisabled}
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
                {showEditGooglePlayClosedTestOption ? (
                  <GooglePlayClosedTestOption
                    checked={editDraft.needsGooglePlayClosedTesters}
                    onChange={setEditGooglePlayClosedTestRequirement}
                  />
                ) : null}
              </div>

              <div className="edit-test-modal__section">
                <div className="section-heading">
                  <h2>{selectedEditProductTypes.length > 1 ? "What are the links to your app?" : "What's the link to your app?"}</h2>
                  {selectedEditProductTypes.length > 1 ? (
                    <p>Add one public link for each selected platform.</p>
                  ) : null}
                </div>
                {selectedEditProductTypes.map((productType) => {
                  const value = editDraft.accessLinks[productType] ?? "";
                  const validation = validateAccessLink(value, productType);
                  const isGooglePlayClosedTestLink =
                    editDraft.needsGooglePlayClosedTesters && productType === "android";

                  return (
                    <label key={productType} className="field">
                      <span>{accessLinkFieldLabel(productType, isGooglePlayClosedTestLink)}</span>
                      <input
                        value={value}
                        onChange={(event) => updateEditAccessLink(productType, event.target.value)}
                        placeholder={accessLinkPlaceholder(productType, isGooglePlayClosedTestLink)}
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
                {editDraft.needsGooglePlayClosedTesters ? (
                  <label className="field field--google-play-instructions">
                    <span>Google Play closed-test access instructions</span>
                    <textarea
                      rows={4}
                      value={editDraft.googlePlayClosedTestInstructions}
                      onChange={(event) =>
                        updateEditDraft({
                          googlePlayClosedTestInstructions: event.target.value,
                        })
                      }
                      placeholder="Example: Open the Google Play testing link, join the test, install the app, and use it once per day for 14 consecutive days."
                    />
                    <small className="helper-text">
                      Include any tester group, opt-in, or install steps needed before users can access the Android closed test.
                    </small>
                  </label>
                ) : null}
                <label className="field">
                  <span>(optional) Tester Instructions</span>
                  <textarea
                    rows={4}
                    value={editDraft.instructions}
                    onChange={(event) => updateEditDraft({ instructions: event.target.value })}
                    placeholder="Example: Test the onboarding flow, try search, create a sample item, and tell us anything confusing or slow."
                  />
                </label>
                <div className="field field--checkbox field--recording-toggle">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={editDraft.requiresRecording}
                      onChange={(event) => updateEditDraft({ requiresRecording: event.target.checked })}
                    />
                    <span>Require testers to record their screen and voice</span>
                  </label>
                  <small>
                    Recording uploads stay available for 7 days, then Test4Test deletes them automatically.
                  </small>
                </div>
              </div>
            </div>

            {editError ? <div className="callout callout--warning">{editError}</div> : null}

            <div className="wizard-actions">
              <button type="button" className="button button--secondary" onClick={closeEditTest} disabled={isSavingEdit}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={() => void saveEditTest()} disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ShareTestModal({
  submission,
  questionSet,
  shareUrl,
  copyStatus,
  onCopy,
  onClose,
}: {
  submission: Submission;
  questionSet: QuestionSetVersion | null;
  shareUrl: string;
  copyStatus: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const accessLinks = getOrderedAccessLinks(submission.accessLinks, submission.productTypes);
  const previewQuestions = [...(questionSet?.questions ?? [])]
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const testerInstructions = submission.instructions.trim()
    ? submission.instructions.trim()
    : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.";
  const sharedTestTitle = `Congrats! You've been selected to try ${submission.productName}`;

  return (
    <div className="results-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="results-modal results-modal--share-test"
        role="dialog"
        aria-modal="true"
        aria-label="Share test"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="results-modal__header">
          <div>
            <h2>Share test</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close share test"
          >
            <X size={18} />
          </button>
        </div>

        <div className="share-test-link-row">
          <input
            value={shareUrl}
            readOnly
            aria-label="Share test link"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="button button--secondary" onClick={onCopy}>
            {copyStatus === "Copied" ? <Check size={16} /> : <Copy size={16} />}
            {copyStatus || "Copy link"}
          </button>
        </div>

        <div className="share-test-modal__copy">
          <h3>Share your test with anyone!</h3>
          <p>No sign ups required. Simply share this link, look out for email notifications and review test results.</p>
        </div>

        <div className="share-test-preview-label">preview</div>
        <div className="share-test-page-preview" aria-label="Shared test preview">
          <div className="test-layout test-layout--single share-test-page-preview__layout">
            <div className="test-session__header">
              <h1>{sharedTestTitle}</h1>
            </div>

            <Surface className="test-questions test-questions--full">
              <div className="test-session__intro-card">
                <div className="test-session__resource">
                  <span className="test-session__label">{accessLinks.length > 1 ? "App links" : "App link"}</span>
                  {accessLinks.length > 0 ? (
                    <div className="test-session__link-list">
                      {accessLinks.map((link) => (
                        <div key={link.productType} className="test-session__link share-test-page-preview__link">
                          <span className="test-session__link-label">{link.label}</span>
                          <span>{link.displayUrl}</span>
                          <ExternalLink size={15} aria-hidden="true" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No public app links were provided for this test.</p>
                  )}
                </div>

                <div className="test-session__resource">
                  <span className="test-session__label">Tester instructions</span>
                  <p>{testerInstructions}</p>
                </div>
              </div>

              {submission.requiresRecording ? (
                <div className="callout callout--soft recording-test-callout share-test-page-preview__recording-callout">
                  <div className="recording-test-callout__copy">
                    <span className="recording-test-callout__eyebrow">Screen + voice recording</span>
                    <strong>This session needs a screen and voice recording.</strong>
                    <p>Open the app, think out loud, and upload the recording with your feedback.</p>
                  </div>
                  <Mic size={20} aria-hidden="true" />
                </div>
              ) : null}

              {previewQuestions.length > 0 ? (
                <div className="question-list test-session__questions">
                  {previewQuestions.map((question) => (
                    <article key={question.id} className="question-card question-card--spacious">
                      <div className="test-session__question-body">
                        <h3>{question.sortOrder}. {question.title}</h3>
                        {question.type === "multiple" ? (
                          <div className="radio-list" aria-hidden="true">
                            {(question.options ?? []).map((option) => (
                              <label key={option} className="radio-card">
                                <input
                                  className="radio-card__control"
                                  type="radio"
                                  name={`preview-${question.id}`}
                                  tabIndex={-1}
                                  disabled
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <label className="field">
                            <textarea
                              rows={5}
                              tabIndex={-1}
                              disabled
                              placeholder="Add a thoughtful answer with enough detail to be genuinely useful."
                            />
                            <small className="helper-text">0 / 40 recommended minimum characters</small>
                          </label>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : submission.requiresRecording ? (
                <div className="recording-questionless-note">
                  <strong>No written questionnaire for this test.</strong>
                  <p>Once the recording is ready, you can submit this test from the footer below.</p>
                </div>
              ) : null}
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}
