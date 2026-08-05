import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Dialog, Textarea, TextField } from "@test4test/design-system";
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeEditTest();
      }}
      title="Edit app"
      description="Update the app details, access links, tester instructions, and recording requirements."
    >
      <div className="form-stack form-stack--edit-test-modal">
        <div className="edit-test-modal__section">
          <div className="section-heading">
            <h2>What&apos;s the name of your app?</h2>
          </div>
          <TextField
            label="App name"
            value={editDraft.productName}
            onChange={(event) => updateEditDraft({ productName: event.target.value })}
            placeholder="Palette Pilot"
          />
          <Textarea
            label="Short app description visible to testers (optional)"
            rows={4}
            value={editDraft.description}
            onChange={(event) => updateEditDraft({ description: event.target.value })}
            placeholder="Write something interesting to catch a tester's attention, such as how Palette Pilot helps teams shape ideas faster."
          />
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
                <Checkbox
                  key={option.value}
                  label={option.title}
                  checked={isSelected}
                  onChange={() => toggleEditProductType(option.value)}
                  disabled={isDisabled}
                />
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
              <TextField
                key={productType}
                label={accessLinkFieldLabel(productType, isGooglePlayClosedTestLink)}
                value={value}
                onChange={(event) => updateEditAccessLink(productType, event.target.value)}
                placeholder={accessLinkPlaceholder(productType, isGooglePlayClosedTestLink)}
                helpText={value.trim() && validation.valid ? validation.message : undefined}
                error={value.trim() && !validation.valid ? validation.message : undefined}
              />
            );
          })}
          {editDraft.needsGooglePlayClosedTesters ? (
            <Textarea
              label="Google Play closed-test access instructions"
              rows={4}
              value={editDraft.googlePlayClosedTestInstructions}
              onChange={(event) =>
                updateEditDraft({
                  googlePlayClosedTestInstructions: event.target.value,
                })
              }
              placeholder="Example: Open the Google Play testing link, join the test, install the app, and use it once per day for 14 consecutive days."
              helpText="Include any tester group, opt-in, or install steps needed before users can access the Android closed test."
            />
          ) : null}
          <Textarea
            label="Tester instructions (optional)"
            rows={4}
            value={editDraft.instructions}
            onChange={(event) => updateEditDraft({ instructions: event.target.value })}
            placeholder="Example: Test the onboarding flow, try search, create a sample item, and tell us anything confusing or slow."
          />
          <Checkbox
            checked={editDraft.requiresRecording}
            onChange={(event) => updateEditDraft({ requiresRecording: event.target.checked })}
            label="Require testers to record their screen and voice"
            description="Recording uploads stay available for 60 days, then Test4Test deletes them automatically."
          />
        </div>
      </div>

      {editError ? <Alert tone="danger">{editError}</Alert> : null}

      <div className="wizard-actions">
        <Button type="button" variant="secondary" onClick={closeEditTest} disabled={isSavingEdit}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void saveEditTest()}
          loading={isSavingEdit}
          loadingLabel="Saving changes..."
        >
          Save changes
        </Button>
      </div>
    </Dialog>
  );
}
