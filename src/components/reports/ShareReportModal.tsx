import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Info,
  Link2,
  Mail,
  Send,
  X,
} from "lucide-react";
import {
  createUsabilityReportShareLink,
  getUsabilityReportSharingOverview,
  shareUsabilityReport,
  type UsabilityReportShareRecipient,
} from "../../lib/usabilityReports";

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

type ShareMethod = "link" | "email";

function recipientInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

async function copyTextToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  }
}

function statusMeta(recipient: UsabilityReportShareRecipient) {
  if (recipient.status === "opened") {
    return { className: "share-report-status--opened", label: "Opened" };
  }

  if (recipient.status === "failed") {
    return { className: "share-report-status--failed", label: "Send failed" };
  }

  if (recipient.deliveryMethod === "link") {
    return { className: "", label: "Link created" };
  }

  if (recipient.remindersSent > 0) {
    return { className: "share-report-status--reminding", label: "Reminder sent" };
  }

  return { className: "", label: "Not opened yet" };
}

export function ShareReportModal({
  reportId,
  reportName,
  productName,
  onClose,
}: ShareReportModalProps) {
  const [method, setMethod] = useState<ShareMethod>("email");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipients, setRecipients] = useState<UsabilityReportShareRecipient[]>([]);
  const [sentRecipient, setSentRecipient] = useState<SentRecipient | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [copiedRecipientId, setCopiedRecipientId] = useState("");
  const normalizedEmail = recipientEmail.trim().toLowerCase();
  const canSubmit = Boolean(
    recipientName.trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      && !isWorking,
  );

  async function loadRecipients() {
    setIsLoadingRecipients(true);

    try {
      setRecipients(await getUsabilityReportSharingOverview(reportId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Shared recipients could not be loaded.");
    } finally {
      setIsLoadingRecipients(false);
    }
  }

  useEffect(() => {
    void loadRecipients();
  }, [reportId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isWorking) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWorking, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setCopyStatus("");

    try {
      if (method === "email") {
        const share = await shareUsabilityReport(reportId, recipientName, normalizedEmail);
        setSentRecipient({
          name: share.recipientName,
          email: share.recipientEmail,
        });
      } else {
        const share = await createUsabilityReportShareLink(
          reportId,
          recipientName,
          normalizedEmail,
        );
        const copied = await copyTextToClipboard(share.shareUrl!);
        setCopyStatus(
          copied
            ? `Link copied for ${share.recipientName}.`
            : "Link created, but it could not be copied automatically.",
        );
        setRecipientName("");
        setRecipientEmail("");
      }

      await loadRecipients();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : method === "email"
            ? "The report invitation could not be sent."
            : "The report link could not be created.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCopyRecipient(recipient: UsabilityReportShareRecipient) {
    setError(null);
    const copied = await copyTextToClipboard(recipient.shareUrl);

    if (!copied) {
      setError("The report link could not be copied automatically.");
      return;
    }

    setCopiedRecipientId(recipient.id);
    window.setTimeout(() => {
      setCopiedRecipientId((current) => current === recipient.id ? "" : current);
    }, 1800);
  }

  function inviteAnother() {
    setRecipientName("");
    setRecipientEmail("");
    setSentRecipient(null);
    setError(null);
    setMethod("email");
  }

  return (
    <div
      className="results-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isWorking) {
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
                If they do not open it, Test4Test will send up to three reminders.
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
                  Share {reportName} for {productName} with a teammate.
                </p>
              </div>
              <button
                type="button"
                className="share-report-close"
                onClick={onClose}
                disabled={isWorking}
                aria-label="Close share report form"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="share-report-methods" role="tablist" aria-label="Share method">
              <button
                type="button"
                className={`share-report-method${method === "link" ? " share-report-method--active" : ""}`}
                role="tab"
                aria-selected={method === "link"}
                onClick={() => {
                  setMethod("link");
                  setError(null);
                  setCopyStatus("");
                }}
              >
                <span className="share-report-method__icon"><Link2 size={20} /></span>
                <span className="share-report-method__text">
                  <strong>Copy a link</strong>
                  <span>Only their email can open it</span>
                </span>
              </button>
              <button
                type="button"
                className={`share-report-method${method === "email" ? " share-report-method--active" : ""}`}
                role="tab"
                aria-selected={method === "email"}
                onClick={() => {
                  setMethod("email");
                  setError(null);
                  setCopyStatus("");
                }}
              >
                <span className="share-report-method__icon"><Mail size={20} /></span>
                <span className="share-report-method__text">
                  <strong>Invite by email</strong>
                  <span>We send and follow up</span>
                </span>
              </button>
            </div>

            <form className="share-report-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="share-test-modal__copy">
                <h3>{method === "email" ? "Invite by email" : "Create a secure link"}</h3>
                <p>
                  {method === "email"
                    ? "We’ll email them a link and send up to three reminders until they open it."
                    : "The copied link only works after the named recipient signs in with this email."}
                </p>
              </div>
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
                      setCopyStatus("");
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
                      setCopyStatus("");
                    }}
                  />
                </label>
                <button type="submit" className="button button--primary" disabled={!canSubmit}>
                  {isWorking ? (
                    <span className="button__spinner" aria-hidden="true" />
                  ) : method === "email" ? (
                    <Send size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  {isWorking ? "Working..." : method === "email" ? "Send" : "Create & copy"}
                </button>
              </div>

              <p className="share-report-note">
                <Info size={15} aria-hidden="true" />
                <span>
                  The recipient signs in with this email to view this report.
                </span>
              </p>

              {copyStatus ? (
                <div className="callout callout--soft share-report-copy-status" role="status">
                  <Check size={16} aria-hidden="true" />
                  <span>{copyStatus}</span>
                </div>
              ) : null}
              {error ? (
                <div className="callout callout--warning share-report-error" role="alert">
                  <span>{error}</span>
                </div>
              ) : null}
            </form>

            <section className="share-report-recipients" aria-labelledby="share-report-recipients-title">
              <div className="share-report-recipients__head">
                <h3 id="share-report-recipients-title">Shared with</h3>
                <span>{recipients.length} {recipients.length === 1 ? "person" : "people"}</span>
              </div>
              {isLoadingRecipients ? (
                <p className="share-report-empty">Loading recipients...</p>
              ) : recipients.length === 0 ? (
                <p className="share-report-empty">No one yet. Create a link or invite a teammate above.</p>
              ) : (
                <div className="share-report-recipients__list">
                  {recipients.map((recipient) => {
                    const meta = statusMeta(recipient);
                    const canCopy = recipient.status === "sent" || recipient.status === "opened";

                    return (
                      <div className="share-report-recipient" key={recipient.id}>
                        <span className="share-report-recipient__avatar" aria-hidden="true">
                          {recipientInitial(recipient.name)}
                        </span>
                        <span className="share-report-recipient__identity">
                          <strong>{recipient.name}</strong>
                          <span>{recipient.email}</span>
                        </span>
                        <span className={`share-report-status ${meta.className}`}>
                          <span className="share-report-status__dot" aria-hidden="true" />
                          {meta.label}
                        </span>
                        {canCopy ? (
                          <button
                            type="button"
                            className="share-report-recipient__copy"
                            onClick={() => void handleCopyRecipient(recipient)}
                            aria-label={`Copy report link for ${recipient.name}`}
                          >
                            {copiedRecipientId === recipient.id ? <Check size={15} /> : <Copy size={15} />}
                            {copiedRecipientId === recipient.id ? "Copied" : "Copy link"}
                          </button>
                        ) : null}
                        {recipient.deliveryMethod === "email" && recipient.remindersSent > 0 ? (
                          <span className="share-report-recipient__meta">
                            Reminder {recipient.remindersSent} of 3 sent
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
