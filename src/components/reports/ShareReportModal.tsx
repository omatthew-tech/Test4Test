import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Info, Send, X } from "lucide-react";
import { shareUsabilityReport } from "../../lib/usabilityReports";

interface ShareReportModalProps {
  reportId: string;
  reportName: string;
  productName: string;
  onClose: () => void;
}

interface SentRecipient {
  name: string;
  email: string;
}

function recipientInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function ShareReportModal({
  reportId,
  reportName,
  productName,
  onClose,
}: ShareReportModalProps) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sentRecipient, setSentRecipient] = useState<SentRecipient | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedEmail = recipientEmail.trim().toLowerCase();
  const canSend = Boolean(
    recipientName.trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      && !isSending,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSending) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSending, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const share = await shareUsabilityReport(reportId, recipientName, normalizedEmail);
      setSentRecipient({
        name: share.recipientName,
        email: share.recipientEmail,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report invitation could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  function inviteAnother() {
    setRecipientName("");
    setRecipientEmail("");
    setSentRecipient(null);
    setError(null);
  }

  return (
    <div
      className="results-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSending) {
          onClose();
        }
      }}
    >
      <div
        className="results-modal results-modal--share-test share-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-report-title"
        aria-describedby="share-report-description"
      >
        {sentRecipient ? (
          <div className="share-report-success">
            <span className="share-report-success__icon" aria-hidden="true">
              <CheckCircle2 size={30} strokeWidth={2.2} />
            </span>
            <h2 id="share-report-title">Invite sent</h2>
            <p id="share-report-description" className="share-report-success__lead">
              Your report is on its way to {sentRecipient.name}.
            </p>
            <div className="share-report-success__card">
              <div className="share-report-success__recipient">
                <span className="share-report-recipient__avatar" aria-hidden="true">
                  {recipientInitial(sentRecipient.name)}
                </span>
                <span className="share-report-recipient__identity">
                  <strong>{sentRecipient.name}</strong>
                  <span>{sentRecipient.email}</span>
                </span>
              </div>
              <p>
                They received a personalized email with a secure sign-in link to {reportName}.
              </p>
            </div>
            <div className="share-report-success__actions">
              <button type="button" className="button button--secondary" onClick={inviteAnother}>
                Invite someone else
              </button>
              <button type="button" className="button button--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="results-modal__header">
              <div>
                <h2 id="share-report-title">Share this report</h2>
                <p id="share-report-description">
                  Email {reportName} for {productName} to a teammate. Access is limited to the
                  email address you invite.
                </p>
              </div>
              <button
                type="button"
                className="share-report-close"
                onClick={onClose}
                disabled={isSending}
                aria-label="Close share report form"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form className="share-report-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="share-report-email-row">
                <label className="field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={recipientName}
                    maxLength={100}
                    autoFocus
                    autoComplete="name"
                    placeholder="First Last"
                    onChange={(event) => {
                      setRecipientName(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={recipientEmail}
                    maxLength={320}
                    autoComplete="email"
                    placeholder="email@example.com"
                    onChange={(event) => {
                      setRecipientEmail(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <button type="submit" className="button button--primary" disabled={!canSend}>
                  {isSending ? (
                    <span className="button__spinner" aria-hidden="true" />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>

              <p className="share-report-note">
                <Info size={15} aria-hidden="true" />
                <span>
                  They’ll sign in or create a free account using this email before viewing the
                  report.
                </span>
              </p>

              {error ? (
                <div className="callout callout--warning share-report-error" role="alert">
                  <span>{error}</span>
                </div>
              ) : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
