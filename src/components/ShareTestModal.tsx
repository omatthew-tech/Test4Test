import { Check, Copy, ExternalLink, Mic, X } from "lucide-react";
import { Surface } from "./Layout";
import { getOrderedAccessLinks } from "../lib/format";
import { QuestionSetVersion, Submission } from "../types";

export function ShareTestModal({
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
