import { useMemo, useState } from "react";
import { ArrowRight, Check, Inbox, X } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  PRODUCT_TYPE_ORDER,
  normalizeProductTypes,
  productTypeLabel,
} from "../lib/format";
import { getMySubmissions } from "../lib/selectors";
import { validateAccessLink } from "../lib/questions";
import { ProductType, Submission, SubmissionDraft, SubmissionStatus } from "../types";
import { formatDate } from "../lib/format";

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
    accessLinks: { ...submission.accessLinks },
    questionMode: submission.questionMode,
  };
}

const productTypeOptions: Array<{ value: ProductType; title: string }> = PRODUCT_TYPE_ORDER.map((value) => ({
  value,
  title: productTypeLabel(value),
}));

export function MyTestsPage() {
  const { state, updateSubmissionDetails } = useAppState();
  const submissions = getMySubmissions(state);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SubmissionDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const selectedEditProductTypes = useMemo(
    () => normalizeProductTypes(editDraft?.productTypes ?? []),
    [editDraft?.productTypes],
  );

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

    for (const productType of selectedEditProductTypes) {
      const value = editDraft.accessLinks[productType] ?? "";
      const validation = validateAccessLink(value, productType);

      if (!value.trim()) {
        return `Add a public ${accessLinkFieldLabel(productType).toLowerCase()} for testers.`;
      }

      if (!validation.valid) {
        return `${productTypeLabel(productType)}: ${validation.message}`;
      }
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

                  <div className="my-test-row__footer">
                    <div className="my-test-row__meta">
                      <div className="my-test-row__metric">
                        <strong>{submission.responseCount}</strong>
                        <span>{submission.responseCount === 1 ? "response" : "responses"}</span>
                      </div>

                      {submission.lastResponseAt ? (
                        <span className="my-test-row__latest">Latest feedback {formatDate(submission.lastResponseAt)}</span>
                      ) : null}
                    </div>

                    <div className="my-test-row__actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => openEditTest(submission)}
                      >
                        Edit test
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

      {editDraft && editingSubmissionId ? (
        <div className="results-modal-backdrop" role="presentation" onClick={closeEditTest}>
          <div
            className="results-modal results-modal--edit-test"
            role="dialog"
            aria-modal="true"
            aria-label="Edit test"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="results-modal__header">
              <div>
                <h2>Edit test</h2>
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

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`choice-card choice-card--multi${isSelected ? " choice-card--active" : ""}`}
                        onClick={() => toggleEditProductType(option.value)}
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

                  return (
                    <label key={productType} className="field">
                      <span>{accessLinkFieldLabel(productType)}</span>
                      <input
                        value={value}
                        onChange={(event) => updateEditAccessLink(productType, event.target.value)}
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
                    value={editDraft.instructions}
                    onChange={(event) => updateEditDraft({ instructions: event.target.value })}
                    placeholder="Example: Test the onboarding flow, try search, create a sample item, and tell us anything confusing or slow."
                  />
                </label>
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

