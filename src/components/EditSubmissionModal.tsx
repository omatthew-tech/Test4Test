import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useModalFocus } from "@test4test/design-system";
import { GooglePlayClosedTestOption } from "./GooglePlayClosedTestOption";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  normalizeProductTypes,
  PRODUCT_TYPE_ORDER,
  productTypeLabel,
} from "../lib/format";
import { validateAccessLink } from "../lib/questions";
import { ProductType, Submission, SubmissionDraft } from "../types";

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

const productTypeOptions: Array<{ value: ProductType; title: string }> = PRODUCT_TYPE_ORDER.map(
  (value) => ({
    value,
    title: productTypeLabel(value),
  }),
);

export function EditSubmissionModal({
  submission,
  onClose,
  onSave,
}: {
  submission: Submission;
  onClose: () => void;
  onSave: (submissionId: string, draft: SubmissionDraft) => Promise<void>;
}) {
  const [editDraft, setEditDraft] = useState<SubmissionDraft>(() => buildEditDraft(submission));
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    setEditDraft(buildEditDraft(submission));
    setEditError("");
    setIsSavingEdit(false);
  }, [submission.id]);

  const selectedEditProductTypes = useMemo(
    () => normalizeProductTypes(editDraft.productTypes),
    [editDraft.productTypes],
  );
  const showEditGooglePlayClosedTestOption =
    selectedEditProductTypes.includes("android") || editDraft.needsGooglePlayClosedTesters === true;
  const isEditGooglePlayClosedTestLocked = editDraft.needsGooglePlayClosedTesters === true;

  const closeEditTest = () => {
    if (isSavingEdit) {
      return;
    }

    onClose();
  };
  const modalFocus = useModalFocus<HTMLDivElement>(true, closeEditTest);

  const updateEditDraft = (next: Partial<SubmissionDraft>) => {
    setEditError("");
    setEditDraft((current) => ({ ...current, ...next }));
  };

  const toggleEditProductType = (productType: ProductType) => {
    setEditError("");
    setEditDraft((current) => {
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
      if (checked) {
        return {
          ...current,
          productTypes: ["android"],
          accessLinks: current.accessLinks.android ? { android: current.accessLinks.android } : {},
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
    setEditDraft((current) => ({
      ...current,
      accessLinks: {
        ...current.accessLinks,
        [productType]: value,
      },
    }));
  };

  const validateEditSubmission = () => {
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
    const nextError = validateEditSubmission();

    if (nextError) {
      setEditError(nextError);
      return;
    }

    setIsSavingEdit(true);

    try {
      await onSave(submission.id, editDraft);
      setEditError("");
      setIsSavingEdit(false);
      onClose();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "The test could not be updated.");
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="results-modal-backdrop" role="presentation" onClick={closeEditTest}>
      <div
        {...modalFocus}
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
            <X size={20} />
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
                    <span
                      className={`choice-card__check${isSelected ? " choice-card__check--active" : ""}`}
                      aria-hidden="true"
                    >
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
              <h2>
                {selectedEditProductTypes.length > 1
                  ? "What are the links to your app?"
                  : "What's the link to your app?"}
              </h2>
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
                  Include any tester group, opt-in, or install steps needed before users can access
                  the Android closed test.
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
                Recording uploads stay available for 60 days, then Test4Test deletes them
                automatically.
              </small>
            </div>
          </div>
        </div>

        {editError ? <div className="callout callout--warning">{editError}</div> : null}

        <div className="wizard-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={closeEditTest}
            disabled={isSavingEdit}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => void saveEditTest()}
            disabled={isSavingEdit}
          >
            {isSavingEdit ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
