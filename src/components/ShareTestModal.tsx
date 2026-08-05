import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Mic } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  Radio,
  Surface,
  Textarea,
  TextField,
} from "@test4test/design-system";
import { getOrderedAccessLinks } from "../lib/format";
import { QuestionSetVersion, Submission } from "../types";

export function ShareTestModal({
  submission,
  questionSet,
  shareUrl,
  copyStatus,
  onCopy,
  onSaveMessage,
  onClose,
}: {
  submission: Submission;
  questionSet: QuestionSetVersion | null;
  shareUrl: string;
  copyStatus: string;
  onCopy: (customMessage: string) => Promise<string | null | undefined>;
  onSaveMessage: (customMessage: string) => Promise<string | null | undefined>;
  onClose: () => void;
}) {
  const accessLinks = getOrderedAccessLinks(submission.accessLinks, submission.productTypes);
  const previewQuestions = [...(questionSet?.questions ?? [])].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const testerInstructions = submission.instructions.trim()
    ? submission.instructions.trim()
    : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.";
  const sharedTestTitle = `Congrats! You've been selected to try ${submission.productName}`;
  const isResettableCustomMessage = (value: string) => {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 && trimmedValue !== sharedTestTitle;
  };
  const [customMessage, setCustomMessage] = useState(() => submission.publicShareMessage ?? "");
  const [savedShareUrl, setSavedShareUrl] = useState("");
  const [messageSaveStatus, setMessageSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const lastSavedMessageRef = useRef(submission.publicShareMessage ?? "");
  const saveSequenceRef = useRef(0);
  const previewTitle = customMessage.trim() ? customMessage.trim() : sharedTestTitle;
  const visibleShareUrl = savedShareUrl || shareUrl;
  const isCopying = copyStatus === "Copying...";
  const hasResettableCustomMessage = isResettableCustomMessage(customMessage);
  const shouldShowResetButton = hasResettableCustomMessage && messageSaveStatus === "idle";
  const messageSaveStatusLabel =
    messageSaveStatus === "saving"
      ? "Saving..."
      : messageSaveStatus === "saved"
        ? "Saved"
        : messageSaveStatus === "error"
          ? "Could not save"
          : "";

  useEffect(() => {
    if (customMessage === lastSavedMessageRef.current) {
      return undefined;
    }

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    setMessageSaveStatus("saving");

    const timeoutId = window.setTimeout(() => {
      void onSaveMessage(customMessage).then((nextShareUrl) => {
        if (saveSequenceRef.current !== saveSequence) {
          return;
        }

        if (!nextShareUrl) {
          setMessageSaveStatus("error");
          return;
        }

        lastSavedMessageRef.current = customMessage;
        setSavedShareUrl(nextShareUrl);
        setMessageSaveStatus(isResettableCustomMessage(customMessage) ? "saved" : "idle");
      });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [customMessage, onSaveMessage]);

  const handleCopy = async () => {
    const nextShareUrl = await onCopy(customMessage);

    if (nextShareUrl) {
      lastSavedMessageRef.current = customMessage;
      setSavedShareUrl(nextShareUrl);
      setMessageSaveStatus(isResettableCustomMessage(customMessage) ? "saved" : "idle");
    }
  };

  const handleResetCustomMessage = () => {
    setCustomMessage("");
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Share test"
      description="Copy the public test link, customize the invitation, and preview what testers will see."
    >
      <div className="share-test-link-row">
        <TextField
          label="Share test link"
          value={visibleShareUrl}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleCopy()}
          loading={isCopying}
          loadingLabel="Copying..."
        >
          {copyStatus === "Copied" ? <Check size={16} /> : <Copy size={16} />}
          {copyStatus || "Copy link"}
        </Button>
      </div>

      <div className="share-test-modal__copy">
        <div className="share-test-message-header">
          {shouldShowResetButton ? (
            <Button type="button" variant="quiet" size="compact" onClick={handleResetCustomMessage}>
              Reset
            </Button>
          ) : messageSaveStatusLabel ? (
            <Alert tone={messageSaveStatus === "error" ? "danger" : "success"}>
              {messageSaveStatusLabel}
            </Alert>
          ) : null}
        </div>
        <Textarea
          id="share-test-message-input"
          label="Add a custom message (optional)"
          value={customMessage}
          onChange={(event) => setCustomMessage(event.target.value)}
          placeholder={sharedTestTitle}
          rows={2}
        />
      </div>

      <div className="share-test-preview-stack">
        <div className="share-test-preview-label">Preview</div>
        <div className="share-test-page-preview" aria-label="Shared test preview">
          <div className="test-layout test-layout--single share-test-page-preview__layout">
            <div className="test-session__header">
              <h3>{previewTitle}</h3>
            </div>

            <Surface className="test-questions test-questions--full">
              <div className="test-session__intro-card">
                <div className="test-session__resource">
                  <span className="test-session__label">
                    {accessLinks.length > 1 ? "App links" : "App link"}
                  </span>
                  {accessLinks.length > 0 ? (
                    <div className="test-session__link-list">
                      {accessLinks.map((link) => (
                        <div
                          key={link.productType}
                          className="test-session__link share-test-page-preview__link"
                        >
                          <span className="test-session__link-label">{link.label}</span>
                          <span>{link.displayUrl}</span>
                          <ExternalLink size={16} aria-hidden="true" />
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
                    <span className="recording-test-callout__eyebrow">
                      Screen + voice recording
                    </span>
                    <strong>This session needs a screen and voice recording.</strong>
                    <p>
                      Open the app, think out loud, and upload the recording with your feedback.
                    </p>
                  </div>
                  <Mic size={20} aria-hidden="true" />
                </div>
              ) : null}

              {previewQuestions.length > 0 ? (
                <div className="question-list test-session__questions">
                  {previewQuestions.map((question) => (
                    <article key={question.id} className="question-card question-card--spacious">
                      <div className="test-session__question-body">
                        <h3>
                          {question.sortOrder}. {question.title}
                        </h3>
                        {question.type === "multiple" ? (
                          <fieldset className="radio-list" aria-label="Preview answer options">
                            {(question.options ?? []).map((option) => (
                              <Radio
                                key={option}
                                name={`preview-${question.id}`}
                                tabIndex={-1}
                                disabled
                                label={option}
                              />
                            ))}
                          </fieldset>
                        ) : (
                          <Textarea
                            label="Preview answer"
                            rows={5}
                            tabIndex={-1}
                            disabled
                            placeholder="Add a thoughtful answer with enough detail to be genuinely useful."
                            helpText="0 / 40 recommended minimum characters"
                          />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : submission.requiresRecording ? (
                <div className="recording-questionless-note">
                  <strong>No written questionnaire for this test.</strong>
                  <p>
                    Once the recording is ready, you can submit this test from the footer below.
                  </p>
                </div>
              ) : null}
            </Surface>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
