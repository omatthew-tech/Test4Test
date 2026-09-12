import { useEffect, useMemo, useRef, useState } from "react";
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
import { getSubmissionSelectOptions } from "../lib/selectors";
import { AccessLinks, ProductType, Submission, SubmissionDraft } from "../types";
import styles from "./EditSubmissionModal.module.css";

const additionalLinkKinds = ["ios", "android", "figma", "other"] as const;
type AdditionalLinkKind = (typeof additionalLinkKinds)[number];
type PendingNavigation =
  { type: "select"; submissionId: string } | { type: "add" } | { type: "close" };

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
    requiresRecording: true,
    needsGooglePlayClosedTesters: submission.needsGooglePlayClosedTesters,
    questionMode: submission.questionMode,
  };
}

function getSubmissionOptionLabel(submission: Submission, activeSubmissionId: string | null) {
  if (submission.id === activeSubmissionId) {
    return `${submission.productName} (currently in use)`;
  }

  const statusLabels: Partial<Record<Submission["status"], string>> = {
    draft: "draft",
    pending_verification: "pending review",
    paused: "paused",
    flagged: "flagged",
  };
  const statusLabel = statusLabels[submission.status];
  return statusLabel ? `${submission.productName} (${statusLabel})` : submission.productName;
}

export function EditSubmissionModal({
  submissions,
  activeSubmissionId,
  submission,
  onSelect,
  onActivate,
  onAdd,
  onClose,
  onSave,
}: {
  submissions: Submission[];
  activeSubmissionId: string | null;
  submission: Submission;
  onSelect: (submissionId: string) => void;
  onActivate: (submissionId: string) => Promise<void>;
  onAdd: () => void;
  onClose: () => void;
  onSave: (submissionId: string, draft: SubmissionDraft) => Promise<void>;
}) {
  const [editDraft, setEditDraft] = useState<SubmissionDraft>(() => buildEditDraft(submission));
  const [selectedAdditionalKind, setSelectedAdditionalKind] = useState<AdditionalLinkKind>("ios");
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [activationTargetId, setActivationTargetId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const confirmationHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const appNameRef = useRef<HTMLInputElement | null>(null);
  const editedSubmissionIdRef = useRef(submission.id);
  const isLegacyWithoutWebsite = !submission.accessLinks.website?.trim();
  const canManageExistingClosedTest = submission.needsGooglePlayClosedTesters;
  const isActiveSubmission = submission.id === activeSubmissionId;
  const canActivateSubmission = submission.status === "live" && !isActiveSubmission;
  const submissionOptions = useMemo(
    () => getSubmissionSelectOptions(submissions, submission),
    [submission, submissions],
  );
  const activationTarget = submissionOptions.find((item) => item.id === activationTargetId) ?? null;

  useEffect(() => {
    if (editedSubmissionIdRef.current === submission.id) return;

    editedSubmissionIdRef.current = submission.id;
    setEditDraft(buildEditDraft(submission));
    setEditError("");
    setIsSavingEdit(false);
    setIsDirty(false);
    setPendingNavigation(null);
    setActivationTargetId(null);
    setActivationError("");
    setIsActivating(false);
  }, [submission]);

  useEffect(() => {
    if (pendingNavigation || activationTarget) {
      window.requestAnimationFrame(() => confirmationHeadingRef.current?.focus());
    }
  }, [activationTarget, pendingNavigation]);

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

  const keepEditing = () => {
    setPendingNavigation(null);
    window.requestAnimationFrame(() => appNameRef.current?.focus());
  };

  const closeEditTest = () => {
    if (isSavingEdit || isActivating) return;

    if (pendingNavigation) {
      keepEditing();
      return;
    }

    if (activationTarget) {
      setActivationTargetId(null);
      setActivationError("");
      return;
    }

    if (isDirty) {
      setPendingNavigation({ type: "close" });
      return;
    }

    onClose();
  };

  const updateEditDraft = (next: Partial<SubmissionDraft>) => {
    setEditError("");
    setIsDirty(true);
    setEditDraft((current) => ({ ...current, ...next }));
  };

  const updateAccessLinks = (nextAccessLinks: AccessLinks) => {
    setEditError("");
    setIsDirty(true);
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
    setIsDirty(true);
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
      requiresRecording: true,
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

  const selectSubmission = (submissionId: string) => {
    if (submissionId === submission.id) return;

    if (isDirty) {
      setPendingNavigation({ type: "select", submissionId });
      return;
    }

    onSelect(submissionId);
  };

  const addTest = () => {
    if (isDirty) {
      setPendingNavigation({ type: "add" });
      return;
    }

    onAdd();
  };

  const discardAndContinue = () => {
    if (!pendingNavigation) return;

    const nextNavigation = pendingNavigation;
    setPendingNavigation(null);
    setIsDirty(false);
    if (nextNavigation.type === "select") {
      onSelect(nextNavigation.submissionId);
      return;
    }

    if (nextNavigation.type === "close") {
      onClose();
      return;
    }

    onAdd();
  };

  const activateSubmission = async () => {
    if (!activationTarget) return;

    setIsActivating(true);
    setActivationError("");
    try {
      await onActivate(activationTarget.id);
      setActivationTargetId(null);
    } catch (error) {
      setActivationError(
        error instanceof Error ? error.message : "The Earn test could not be changed.",
      );
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeEditTest();
      }}
      title={<span className="ds-sr-only">Edit app</span>}
    >
      {pendingNavigation ? (
        <div className={styles.confirmation}>
          <div className={styles.confirmationCopy}>
            <h3 ref={confirmationHeadingRef} tabIndex={-1}>
              Discard changes to {submission.productName}?
            </h3>
            <p>Your unsaved changes will be lost.</p>
          </div>
          <div className={styles.confirmationActions}>
            <Button type="button" variant="secondary" onClick={keepEditing}>
              Keep editing
            </Button>
            <Button type="button" onClick={discardAndContinue}>
              {pendingNavigation.type === "close" ? "Discard changes" : "Discard and continue"}
            </Button>
          </div>
        </div>
      ) : activationTarget ? (
        <div className={styles.confirmation}>
          <div className={styles.confirmationCopy}>
            <h3 ref={confirmationHeadingRef} tabIndex={-1}>
              Are you sure you want to swap to {activationTarget.productName}?
            </h3>
            <p>
              Your current test will stop receiving feedback from the earn page. However, you'll
              continue receiving feedback from any links you've shared.
            </p>
          </div>
          {activationError ? <Alert tone="danger">{activationError}</Alert> : null}
          <div className={styles.confirmationActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setActivationTargetId(null);
                setActivationError("");
              }}
              disabled={isActivating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void activateSubmission()}
              loading={isActivating}
              loadingLabel="Switching test..."
            >
              Use this test
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.testPicker}>
            <div className={styles.testSelect}>
              <Select
                label="Test"
                value={submission.id}
                onChange={(event) => selectSubmission(event.target.value)}
              >
                {submissionOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getSubmissionOptionLabel(item, activeSubmissionId)}
                  </option>
                ))}
              </Select>
            </div>
            {canActivateSubmission ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setActivationError("");
                  setActivationTargetId(submission.id);
                }}
              >
                Use this test
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={addTest}>
              <Plus size={16} />
              Add test
            </Button>
          </div>

          {submission.status !== "live" ? (
            <Alert>
              This test is{" "}
              {getSubmissionOptionLabel(submission, activeSubmissionId).match(/\((.+)\)$/)?.[1] ??
                "unavailable"}{" "}
              and cannot be used on Earn yet.
            </Alert>
          ) : null}

          <div className="form-stack form-stack--edit-test-modal">
            <div className="edit-test-modal__section">
              <div className="section-heading">
                <h2>App details</h2>
              </div>
              <TextField
                ref={appNameRef}
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
                          updateAccessLinks({
                            ...editDraft.accessLinks,
                            [kind]: event.target.value,
                          })
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
            <Button
              type="button"
              variant="secondary"
              onClick={closeEditTest}
              disabled={isSavingEdit}
            >
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
        </>
      )}
    </Dialog>
  );
}
