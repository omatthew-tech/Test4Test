import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Select,
  Textarea,
  TextField,
} from "@test4test/design-system";
import { GooglePlayClosedTestOption } from "./GooglePlayClosedTestOption";
import {
  accessLinkFieldLabel,
  accessLinkPlaceholder,
  normalizeAccessLinks,
  productTypesFromAccessLinks,
} from "../lib/format";
import {
  MAX_INSTRUCTION_STEPS,
  normalizeInstructionSteps,
  serializeInstructionSteps,
} from "../lib/instructions";
import { validateAccessLink } from "../lib/questions";
import { AccessLinks, ProductType, Submission, SubmissionDraft } from "../types";

const additionalLinkKinds = ["ios", "android", "figma", "other"] as const;
type AdditionalLinkKind = (typeof additionalLinkKinds)[number];

const additionalLinkLabels: Record<AdditionalLinkKind, string> = {
  ios: "iOS app",
  android: "Android app",
  figma: "Figma",
  other: "Other",
};

function deriveProductTypes(accessLinks: AccessLinks, needsGooglePlayClosedTesters: boolean) {
  if (needsGooglePlayClosedTesters) return ["android"] satisfies ProductType[];
  return productTypesFromAccessLinks(accessLinks);
}

function buildEditDraft(submission: Submission): SubmissionDraft {
  const instructionSteps = normalizeInstructionSteps(
    submission.instructionSteps,
    submission.instructions,
  );

  return {
    productName: submission.productName,
    productTypes: [...submission.productTypes],
    description: submission.description,
    targetAudience: submission.targetAudience,
    instructions: serializeInstructionSteps(instructionSteps),
    instructionSteps: instructionSteps.length > 0 ? instructionSteps : [""],
    googlePlayClosedTestInstructions: submission.googlePlayClosedTestInstructions,
    accessLinks: { ...submission.accessLinks },
    requiresRecording: submission.requiresRecording,
    needsGooglePlayClosedTesters: submission.needsGooglePlayClosedTesters,
    questionMode: submission.questionMode,
  };
}

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
  const [selectedAdditionalKind, setSelectedAdditionalKind] = useState<AdditionalLinkKind>("ios");
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const isLegacyWithoutWebsite = !submission.accessLinks.website?.trim();
  const canManageExistingClosedTest = submission.needsGooglePlayClosedTesters;

  useEffect(() => {
    setEditDraft(buildEditDraft(submission));
    setEditError("");
    setIsSavingEdit(false);
  }, [submission]);

  const activeAdditionalKinds = useMemo(
    () => additionalLinkKinds.filter((kind) => editDraft.accessLinks[kind] !== undefined),
    [editDraft.accessLinks],
  );
  const availableAdditionalKinds = useMemo(
    () => additionalLinkKinds.filter((kind) => !activeAdditionalKinds.includes(kind)),
    [activeAdditionalKinds],
  );

  useEffect(() => {
    if (
      availableAdditionalKinds.length > 0 &&
      !availableAdditionalKinds.includes(selectedAdditionalKind)
    ) {
      setSelectedAdditionalKind(availableAdditionalKinds[0]);
    }
  }, [availableAdditionalKinds, selectedAdditionalKind]);

  const closeEditTest = () => {
    if (!isSavingEdit) onClose();
  };

  const updateEditDraft = (next: Partial<SubmissionDraft>) => {
    setEditError("");
    setEditDraft((current) => ({ ...current, ...next }));
  };

  const updateAccessLinks = (nextAccessLinks: AccessLinks) => {
    setEditError("");
    setEditDraft((current) => ({
      ...current,
      accessLinks: nextAccessLinks,
      productTypes: deriveProductTypes(nextAccessLinks, current.needsGooglePlayClosedTesters),
    }));
  };

  const addAdditionalLink = () => {
    if (!availableAdditionalKinds.includes(selectedAdditionalKind)) return;

    const nextAccessLinks: AccessLinks = { ...editDraft.accessLinks };
    if (selectedAdditionalKind === "other") {
      nextAccessLinks.other = { label: "", url: "" };
    } else {
      nextAccessLinks[selectedAdditionalKind] = "";
    }
    updateAccessLinks(nextAccessLinks);
  };

  const removeAdditionalLink = (kind: AdditionalLinkKind) => {
    const nextAccessLinks = { ...editDraft.accessLinks };
    delete nextAccessLinks[kind];
    updateAccessLinks(nextAccessLinks);
  };

  const updateInstructionStep = (index: number, value: string) => {
    setEditDraft((current) => {
      const instructionSteps = current.instructionSteps.map((step, stepIndex) =>
        stepIndex === index ? value : step,
      );
      return {
        ...current,
        instructionSteps,
        instructions: serializeInstructionSteps(instructionSteps),
      };
    });
    setEditError("");
  };

  const addInstructionStep = () => {
    if (editDraft.instructionSteps.length >= MAX_INSTRUCTION_STEPS) return;
    updateEditDraft({ instructionSteps: [...editDraft.instructionSteps, ""] });
  };

  const removeInstructionStep = (index: number) => {
    const instructionSteps = editDraft.instructionSteps.filter(
      (_, stepIndex) => stepIndex !== index,
    );
    updateEditDraft({
      instructionSteps,
      instructions: serializeInstructionSteps(instructionSteps),
    });
  };

  const setEditGooglePlayClosedTestRequirement = (checked: boolean) => {
    updateEditDraft({
      needsGooglePlayClosedTesters: checked,
      productTypes: deriveProductTypes(editDraft.accessLinks, checked),
      googlePlayClosedTestInstructions: checked ? editDraft.googlePlayClosedTestInstructions : "",
    });
  };

  const validateEditSubmission = () => {
    if (!editDraft.productName.trim()) return "Add an app name to continue.";

    const normalizedLinks = normalizeAccessLinks(editDraft.accessLinks);
    const website = editDraft.accessLinks.website ?? "";

    if (!isLegacyWithoutWebsite || website.trim()) {
      const validation = validateAccessLink(website, "website");
      if (!website.trim()) return "Add a public website link for testers.";
      if (!validation.valid) return `Website: ${validation.message}`;
    }

    for (const kind of activeAdditionalKinds) {
      if (kind === "other") {
        if (!editDraft.accessLinks.other?.label.trim()) return "Add a name for the Other link.";
        const url = editDraft.accessLinks.other?.url ?? "";
        const validation = validateAccessLink(url, "other");
        if (!url.trim()) return "Add a public URL for the Other link or remove it.";
        if (!validation.valid) return `Other link: ${validation.message}`;
        continue;
      }

      const url = editDraft.accessLinks[kind] ?? "";
      const validation = validateAccessLink(url, kind);
      if (!url.trim()) return `Add a public ${additionalLinkLabels[kind]} link or remove it.`;
      if (!validation.valid) return `${additionalLinkLabels[kind]}: ${validation.message}`;
    }

    const productTypes = deriveProductTypes(
      normalizedLinks,
      editDraft.needsGooglePlayClosedTesters,
    );
    if (productTypes.length === 0) {
      return "Keep at least one Website, iOS, or Android link for testers.";
    }

    if (editDraft.needsGooglePlayClosedTesters) {
      if (!normalizedLinks.android) return "Keep an Android link for the Google Play closed test.";
      if (!editDraft.googlePlayClosedTestInstructions.trim()) {
        return "Add Google Play closed-test access instructions for testers.";
      }
    }

    if (
      editDraft.instructionSteps.length < 1 ||
      editDraft.instructionSteps.length > MAX_INSTRUCTION_STEPS ||
      editDraft.instructionSteps.some((step) => !step.trim())
    ) {
      return "Add a task for every tester instruction step, using no more than five steps.";
    }

    return "";
  };

  const saveEditTest = async () => {
    const nextError = validateEditSubmission();
    if (nextError) {
      setEditError(nextError);
      return;
    }

    const instructionSteps = editDraft.instructionSteps.map((step) => step.trim());
    const finalDraft: SubmissionDraft = {
      ...editDraft,
      productTypes: deriveProductTypes(
        normalizeAccessLinks(editDraft.accessLinks),
        editDraft.needsGooglePlayClosedTesters,
      ),
      instructions: serializeInstructionSteps(instructionSteps),
      instructionSteps,
      requiresRecording: submission.requiresRecording,
    };

    setIsSavingEdit(true);
    try {
      await onSave(submission.id, finalDraft);
      setEditError("");
      onClose();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "The test could not be updated.");
    } finally {
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
      description="Update the app details, resource links, and tester instructions."
    >
      <div className="form-stack form-stack--edit-test-modal">
        <div className="edit-test-modal__section">
          <div className="section-heading">
            <h2>App details</h2>
          </div>
          <TextField
            label="App name"
            value={editDraft.productName}
            onChange={(event) => updateEditDraft({ productName: event.target.value })}
            placeholder="Palette Pilot"
            required
          />
          <Textarea
            label="Short app description visible to testers (optional)"
            rows={4}
            value={editDraft.description}
            onChange={(event) => updateEditDraft({ description: event.target.value })}
            placeholder="Write something interesting to catch a tester's attention."
          />
        </div>

        <div className="edit-test-modal__section">
          <div className="section-heading">
            <h2>App links</h2>
          </div>
          <TextField
            type="url"
            label={
              isLegacyWithoutWebsite
                ? "Website / Web app link (optional for this existing app)"
                : "Website / Web app link"
            }
            value={editDraft.accessLinks.website ?? ""}
            onChange={(event) =>
              updateAccessLinks({ ...editDraft.accessLinks, website: event.target.value })
            }
            placeholder={accessLinkPlaceholder("website")}
            disabled={editDraft.needsGooglePlayClosedTesters && isLegacyWithoutWebsite}
          />

          {activeAdditionalKinds.map((kind) =>
            kind === "other" ? (
              <div className="edit-test-modal__field-row" key={kind}>
                <div className="edit-test-modal__field-stack">
                  <TextField
                    label="Other link name"
                    value={editDraft.accessLinks.other?.label ?? ""}
                    onChange={(event) =>
                      updateAccessLinks({
                        ...editDraft.accessLinks,
                        other: {
                          label: event.target.value,
                          url: editDraft.accessLinks.other?.url ?? "",
                        },
                      })
                    }
                    placeholder="Interactive prototype"
                    required
                  />
                  <TextField
                    type="url"
                    label="Other link URL"
                    value={editDraft.accessLinks.other?.url ?? ""}
                    onChange={(event) =>
                      updateAccessLinks({
                        ...editDraft.accessLinks,
                        other: {
                          label: editDraft.accessLinks.other?.label ?? "",
                          url: event.target.value,
                        },
                      })
                    }
                    placeholder={accessLinkPlaceholder("other")}
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
            ) : (
              <div className="edit-test-modal__field-row" key={kind}>
                <div className="edit-test-modal__field-stack">
                  <TextField
                    type="url"
                    label={accessLinkFieldLabel(kind)}
                    value={editDraft.accessLinks[kind] ?? ""}
                    onChange={(event) =>
                      updateAccessLinks({ ...editDraft.accessLinks, [kind]: event.target.value })
                    }
                    placeholder={accessLinkPlaceholder(kind)}
                    required
                  />
                </div>
                <IconButton
                  type="button"
                  label={`Remove ${additionalLinkLabels[kind]} link`}
                  variant="danger"
                  onClick={() => removeAdditionalLink(kind)}
                  disabled={editDraft.needsGooglePlayClosedTesters && kind === "android"}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ),
          )}

          {availableAdditionalKinds.length > 0 ? (
            <div className="edit-test-modal__add-link">
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

          {canManageExistingClosedTest ? (
            <>
              <GooglePlayClosedTestOption
                checked={editDraft.needsGooglePlayClosedTesters}
                onChange={setEditGooglePlayClosedTestRequirement}
              />
              {editDraft.needsGooglePlayClosedTesters ? (
                <Textarea
                  label="Google Play closed-test access instructions"
                  rows={4}
                  value={editDraft.googlePlayClosedTestInstructions}
                  onChange={(event) =>
                    updateEditDraft({ googlePlayClosedTestInstructions: event.target.value })
                  }
                  helpText="Include any opt-in or install steps needed before testers can access the Android closed test."
                  required
                />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="edit-test-modal__section">
          <div className="section-heading">
            <h2>Tester instructions</h2>
            <p>Keep the full task focused enough to complete in 5–10 minutes.</p>
          </div>
          {editDraft.instructionSteps.map((instruction, index) => (
            <div className="edit-test-modal__field-row" key={`instruction-${index}`}>
              <div className="edit-test-modal__field-stack">
                <Textarea
                  label={`Step ${index + 1}`}
                  rows={3}
                  value={instruction}
                  onChange={(event) => updateInstructionStep(index, event.target.value)}
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
          {editDraft.instructionSteps.length < MAX_INSTRUCTION_STEPS ? (
            <Button type="button" variant="secondary" onClick={addInstructionStep}>
              <Plus size={16} />
              Add another step
            </Button>
          ) : null}
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
