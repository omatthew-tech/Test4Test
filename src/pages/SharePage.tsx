import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import {
  Alert,
  Button,
  EmptyState,
  Link,
  Stack,
  Surface,
  Textarea,
  TextField,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { getOrderedAccessLinks } from "../lib/format";
import { getMySubmissions } from "../lib/selectors";
import { buildReadableShareUrl, buildShareUrlFromSlug } from "../lib/shareLinks";
import styles from "./SharePage.module.css";

type CopyStatus = "idle" | "copying" | "copied" | "error";
type MessageSaveStatus = "idle" | "saving" | "saved" | "error";

function isResettableCustomMessage(value: string, fallbackTitle: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 && trimmedValue !== fallbackTitle;
}

async function copyTextToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Continue to the legacy browser fallback below.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.className = "ds-sr-only";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function SharePage() {
  const { state, upsertSubmissionShareLink } = useAppState();
  const liveSubmission = useMemo(
    () =>
      getMySubmissions(state).find(
        (submission) => submission.status === "live" && submission.isOpenForMoreTests,
      ) ?? null,
    [state],
  );
  const sharedTestTitle = liveSubmission
    ? `Congrats! You've been selected to try ${liveSubmission.productName}`
    : "";
  const activeSubmissionIdRef = useRef(liveSubmission?.id ?? null);
  const lastSavedMessageRef = useRef(liveSubmission?.publicShareMessage ?? "");
  const saveSequenceRef = useRef(0);
  const [customMessage, setCustomMessage] = useState(
    () => liveSubmission?.publicShareMessage ?? "",
  );
  const [savedShareUrl, setSavedShareUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [messageSaveStatus, setMessageSaveStatus] = useState<MessageSaveStatus>("idle");

  useEffect(() => {
    const nextSubmissionId = liveSubmission?.id ?? null;
    if (activeSubmissionIdRef.current === nextSubmissionId) return;

    activeSubmissionIdRef.current = nextSubmissionId;
    const nextMessage = liveSubmission?.publicShareMessage ?? "";
    lastSavedMessageRef.current = nextMessage;
    saveSequenceRef.current += 1;
    setCustomMessage(nextMessage);
    setSavedShareUrl("");
    setCopyStatus("idle");
    setMessageSaveStatus("idle");
  }, [liveSubmission?.id, liveSubmission?.publicShareMessage]);

  const saveShareMessage = useCallback(
    async (message: string) => {
      if (!liveSubmission) return null;

      try {
        const { slug } = await upsertSubmissionShareLink(liveSubmission.id, message);
        return buildShareUrlFromSlug(slug);
      } catch {
        return null;
      }
    },
    [liveSubmission, upsertSubmissionShareLink],
  );

  useEffect(() => {
    if (!liveSubmission || customMessage === lastSavedMessageRef.current) {
      return undefined;
    }

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    setMessageSaveStatus("saving");

    const timeoutId = window.setTimeout(() => {
      void saveShareMessage(customMessage).then((nextShareUrl) => {
        if (saveSequenceRef.current !== saveSequence) return;

        if (!nextShareUrl) {
          setMessageSaveStatus("error");
          return;
        }

        lastSavedMessageRef.current = customMessage;
        setSavedShareUrl(nextShareUrl);
        setMessageSaveStatus(
          isResettableCustomMessage(customMessage, sharedTestTitle) ? "saved" : "idle",
        );
      });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [customMessage, liveSubmission, saveShareMessage, sharedTestTitle]);

  if (!liveSubmission) {
    return (
      <AppShell>
        <h1 className="ds-sr-only">Share</h1>
        <EmptyState
          icon={<Share2 size={24} />}
          title="No live test to share"
          description="Publish a test before sharing it with testers."
          action={<Link to="/submit">Submit an app</Link>}
        />
      </AppShell>
    );
  }

  const accessLinks = getOrderedAccessLinks(
    liveSubmission.accessLinks,
    liveSubmission.productTypes,
  );
  const testerInstructionSteps =
    liveSubmission.instructionSteps.length > 0
      ? liveSubmission.instructionSteps
      : [
          "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.",
        ];
  const previewTitle = customMessage.trim() || sharedTestTitle;
  const visibleShareUrl = savedShareUrl || buildReadableShareUrl(liveSubmission);
  const hasResettableCustomMessage = isResettableCustomMessage(customMessage, sharedTestTitle);
  const isCopying = copyStatus === "copying";

  const handleCopy = async () => {
    setCopyStatus("copying");
    const nextShareUrl = await saveShareMessage(customMessage);

    if (!nextShareUrl) {
      setCopyStatus("error");
      return;
    }

    const copied = await copyTextToClipboard(nextShareUrl);
    if (!copied) {
      setCopyStatus("error");
      return;
    }

    lastSavedMessageRef.current = customMessage;
    setSavedShareUrl(nextShareUrl);
    setMessageSaveStatus(hasResettableCustomMessage ? "saved" : "idle");
    setCopyStatus("copied");
  };

  const handleResetCustomMessage = () => {
    setCustomMessage("");
    setCopyStatus("idle");
  };

  return (
    <AppShell>
      <Stack className={styles.page} gap="xl">
        <Surface
          as="section"
          aria-labelledby="share-controls-title"
          className={styles.controls}
          tone="raised"
        >
          <Stack gap="lg">
            <div className={styles.controlsHeading}>
              <h1 id="share-controls-title">Share {liveSubmission.productName}</h1>
              <p>Anyone with this link can complete your live test.</p>
            </div>

            <div className={styles.linkRow}>
              <TextField
                label="Share test link"
                type="url"
                value={visibleShareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                className={styles.copyButton}
                type="button"
                variant="secondary"
                onClick={() => void handleCopy()}
                loading={isCopying}
                loadingLabel="Copying..."
              >
                {copyStatus === "copied" ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "error"
                    ? "Copy failed"
                    : "Copy link"}
              </Button>
            </div>

            {copyStatus === "copied" ? (
              <Alert tone="success">The public test link is ready to paste.</Alert>
            ) : copyStatus === "error" ? (
              <Alert tone="danger">
                We couldn't copy the link. Select the link above and copy it manually.
              </Alert>
            ) : null}

            <div className={styles.messageField}>
              <Textarea
                id="share-test-message-input"
                label="Add a custom message (optional)"
                value={customMessage}
                onChange={(event) => {
                  setCustomMessage(event.target.value);
                  setCopyStatus("idle");
                }}
                placeholder={sharedTestTitle}
                rows={2}
              />
              {hasResettableCustomMessage || messageSaveStatus !== "idle" ? (
                <div className={styles.messageFooter}>
                  {hasResettableCustomMessage && messageSaveStatus !== "saving" ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="compact"
                      onClick={handleResetCustomMessage}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <div className={styles.messageStatus}>
                    {messageSaveStatus === "saving" ? (
                      <Alert>Saving message...</Alert>
                    ) : messageSaveStatus === "saved" ? (
                      <Alert tone="success">Message saved.</Alert>
                    ) : messageSaveStatus === "error" ? (
                      <Alert tone="danger">
                        We couldn't save your message. Your existing share link is still available.
                      </Alert>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </Stack>
        </Surface>

        <section aria-labelledby="share-preview-title" className={styles.previewSection}>
          <div className={styles.previewHeading}>
            <h2 id="share-preview-title">Preview</h2>
            <p>This is what testers will see.</p>
          </div>

          <div className={styles.previewFrame} role="region" aria-label="Shared test preview">
            <div className={`test-layout test-layout--single ${styles.previewLayout}`}>
              <div className="test-session__header">
                <h3>{previewTitle}</h3>
              </div>

              <Surface className={`test-questions test-questions--full ${styles.previewContent}`}>
                <div className="test-session__intro-card">
                  <div className="test-session__resource">
                    <span className="test-session__label">
                      {accessLinks.length > 1 ? "App links" : "App link"}
                    </span>
                    {accessLinks.length > 0 ? (
                      <div className="test-session__link-list">
                        {accessLinks.map((link) => (
                          <div
                            key={link.kind}
                            className={`test-session__link ${styles.previewLink}`}
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
                    <ol className="test-session__instruction-list">
                      {testerInstructionSteps.map((instruction, index) => (
                        <li key={`${index}-${instruction}`}>{instruction}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <Surface tone="subtle">
                  <Stack gap="sm">
                    <strong>This session needs a screen and voice recording.</strong>
                    <p>
                      Open the app, think out loud, then upload your recording and submit the test.
                    </p>
                  </Stack>
                </Surface>
              </Surface>
            </div>
          </div>
        </section>
      </Stack>
    </AppShell>
  );
}
