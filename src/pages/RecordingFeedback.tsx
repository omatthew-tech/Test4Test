import { readStarRating } from "../lib/starRatings";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Coins, Copy, MessageCircle, Share2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Alert,
  Button,
  Dialog,
  Link,
  RatingControl,
  Stack,
  TextField,
} from "@test4test/design-system";
import { createRecordingShareUrl } from "../lib/recordingShare";
import {
  loadRecordingContact,
  loadRecordingRating,
  recordingPaymentLinks,
  requestTipPaymentMethods,
  saveRecordingRating,
  type RecordingContact,
} from "../lib/recordingFeedback";
import type { StarRating, TestResponse } from "../types";
import styles from "./RecordingFeedback.module.css";

const fixtureRatings = new Map<string, StarRating | null>();

export function RecordingFeedback({
  response,
  userId,
  fixtureMode,
  fixtureContact,
}: {
  response: TestResponse;
  userId: string;
  productName: string;
  fixtureMode: boolean;
  fixtureContact?: RecordingContact;
}) {
  const id = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const fixtureKey = `${userId}:${response.id}`;
  const [rating, setRating] = useState<StarRating | null>(fixtureRatings.get(fixtureKey) ?? null);
  const [draftRating, setDraftRating] = useState<StarRating | null>(null);
  const ratingForm = useRef<HTMLFormElement>(null);
  const focusAfterSubmit = useRef(false);
  const [ratingLoading, setRatingLoading] = useState(true);
  const [ratingLoaded, setRatingLoaded] = useState(false);
  const [ratingError, setRatingError] = useState("");
  const [ratingStatus, setRatingStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [dialog, setDialog] = useState<"tip" | "message" | "share" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareRetry, setShareRetry] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [contact, setContact] = useState<RecordingContact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactRetry, setContactRetry] = useState(0);
  const [requestPending, setRequestPending] = useState(false);
  const [requestStatus, setRequestStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRatingLoading(true);
    setRatingError("");
    const load = fixtureMode
      ? Promise.resolve(fixtureRatings.get(fixtureKey) ?? null)
      : loadRecordingRating(response.id, userId);
    void load
      .then((value) => {
        if (!cancelled) {
          setRating(value);
          setDraftRating(null);
          setRatingLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setRatingError("Your rating could not be loaded. Try again.");
      })
      .finally(() => {
        if (!cancelled) setRatingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [response.id, userId, fixtureMode, fixtureKey, retry]);

  useEffect(() => {
    if (dialog !== "tip" || !response.testerUserId) return;
    let cancelled = false;
    setContactLoading(true);
    setContactError("");
    const load = fixtureMode
      ? Promise.resolve(fixtureContact ?? null)
      : loadRecordingContact(response.testerUserId);
    void load
      .then((value) => {
        if (!cancelled) setContact(value);
      })
      .catch(() => {
        if (!cancelled) setContactError("Tester contact details could not be loaded. Try again.");
      })
      .finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, response.testerUserId, fixtureMode, fixtureContact, contactRetry]);

  useEffect(() => {
    if (dialog !== "share") return;
    let cancelled = false;
    setShareUrl("");
    setShareError("");
    setCopyStatus("idle");
    void createRecordingShareUrl(response.id)
      .then((url) => {
        if (!cancelled) setShareUrl(url);
      })
      .catch((error) => {
        if (!cancelled) {
          setShareError(
            error instanceof Error ? error.message : "The recording link could not be created.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, response.id, shareRetry]);

  useEffect(() => {
    if (ratingLoading || !focusAfterSubmit.current) return;
    focusAfterSubmit.current = false;
    if (document.activeElement === document.body) {
      ratingForm.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
  }, [ratingLoading, draftRating]);

  const submitRating = async () => {
    if (ratingLoading || !ratingLoaded || draftRating === null) return;
    const value = draftRating;
    setRatingLoading(true);
    setRatingError("");
    setRatingStatus("Saving rating…");
    try {
      if (fixtureMode) fixtureRatings.set(fixtureKey, value);
      else await saveRecordingRating(response.id, userId, value);
      setRating(value);
      setDraftRating(null);
      setRatingStatus(`${value} ${value === 1 ? "star" : "stars"} saved.`);
      focusAfterSubmit.current = true;
    } catch (error) {
      setRatingError(
        error instanceof Error ? error.message : "Your rating could not be saved. Try again.",
      );
      setRatingStatus("");
    } finally {
      setRatingLoading(false);
    }
  };

  const paymentLinks = contact ? recordingPaymentLinks(contact) : [];
  const savedPaymentDetails = contact
    ? [
        { label: "PayPal", value: contact.paypalHandle },
        { label: "Venmo", value: contact.venmoHandle },
        { label: "Cash App", value: contact.cashAppHandle },
      ].filter((method) => method.value?.trim())
    : [];
  const openDialog = (value: "tip" | "message" | "share") => {
    setContact(null);
    setContactError("");
    setRequestStatus("");
    setDialog(value);
  };

  return (
    <div className={styles.feedback}>
      <div className={styles.toolbar}>
        <form
          className={styles.rating}
          data-rated={rating !== null}
          ref={ratingForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submitRating();
          }}
        >
          <RatingControl
            legend="Rate video"
            name={`${id}-rating`}
            variant="stars"
            value={draftRating ?? rating ?? undefined}
            onChange={(value) => {
              setDraftRating(readStarRating(value));
              setRatingError("");
              setRatingStatus("");
            }}
            disabled={ratingLoading || !ratingLoaded}
            describedBy={`${id}-rating-help`}
          />
          {draftRating !== null ? (
            <Button
              type="submit"
              variant="quiet"
              className={styles.submit}
              loading={ratingLoading}
              loadingLabel="Submitting…"
            >
              Submit
            </Button>
          ) : null}
          <p id={`${id}-rating-help`} className="ds-sr-only">
            Optional. Stars contribute to tester reputation. This rating applies to the current
            recording. Choose a star, then select Submit to save your rating.
          </p>
          <p className="ds-sr-only" role="status">
            {ratingStatus}
          </p>
        </form>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="quiet"
            className={styles.action}
            onClick={() => openDialog("tip")}
          >
            <Coins aria-hidden="true" />
            Tip
          </Button>
          <Button
            type="button"
            variant="quiet"
            className={styles.action}
            onClick={() => {
              if (!response.testerUserId) {
                openDialog("message");
                return;
              }
              const query = new URLSearchParams({ response: response.id });
              if (fixtureMode) {
                const current = new URLSearchParams(location.search);
                for (const key of ["ds-user", "ds-tester"]) {
                  const value = current.get(key);
                  if (value) query.set(key, value);
                }
              }
              navigate(`/messages?${query}`);
            }}
          >
            <MessageCircle aria-hidden="true" />
            Message
          </Button>
          <Button
            type="button"
            variant="quiet"
            className={styles.action}
            onClick={() => openDialog("share")}
          >
            <Share2 aria-hidden="true" />
            Share
          </Button>
        </div>
      </div>
      {ratingError ? (
        <Alert tone="danger">
          {ratingError}
          {!ratingLoaded ? (
            <Button variant="quiet" onClick={() => setRetry((value) => value + 1)}>
              Retry rating
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <Dialog
        open={dialog === "tip" || dialog === "message"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog === "tip" ? "Tip the tester" : "Message the tester"}
      >
        <Stack gap="md">
          {!response.testerUserId ? (
            <p>This public recording has no tester contact details.</p>
          ) : contactLoading ? (
            <p role="status">Loading tester details…</p>
          ) : contactError ? (
            <Alert tone="danger">
              {contactError}
              <Button variant="quiet" onClick={() => setContactRetry((value) => value + 1)}>
                Try again
              </Button>
            </Alert>
          ) : !contact ? (
            <p>This tester’s contact details are unavailable.</p>
          ) : dialog === "tip" ? (
            <>
              {paymentLinks.length ? (
                <>
                  <p>
                    Choose a payment service to tip this tester. You’ll confirm the amount there.
                  </p>
                  {paymentLinks.map((link) => (
                    <Link
                      key={link.label}
                      to={link.url}
                      external
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open {link.label}
                    </Link>
                  ))}
                </>
              ) : savedPaymentDetails.length ? (
                <>
                  <p>Use these saved details in your payment app to tip the tester.</p>
                  {savedPaymentDetails.map((method) => (
                    <p key={method.label} className={styles.paymentDetails}>
                      {method.label}: {method.value}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p>
                    This tester hasn’t added a supported payment link yet. You can email them a
                    request to add one.
                  </p>
                  <Button
                    disabled={Boolean(requestStatus)}
                    loading={requestPending}
                    loadingLabel="Sending request…"
                    onClick={async () => {
                      setRequestPending(true);
                      try {
                        setRequestStatus(
                          fixtureMode
                            ? "Demo: payment-method request prepared."
                            : await requestTipPaymentMethods(response.id),
                        );
                      } catch (error) {
                        setContactError(
                          error instanceof Error ? error.message : "The request could not be sent.",
                        );
                      } finally {
                        setRequestPending(false);
                      }
                    }}
                  >
                    Request payment link
                  </Button>
                  <p role="status">{requestStatus}</p>
                </>
              )}
            </>
          ) : null}
        </Stack>
      </Dialog>
      <Dialog
        open={dialog === "share"}
        className={styles.shareDialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Share recording"
        description="Anyone with this link can view this recording. No sign up required."
      >
        <Stack gap="md">
          {shareError ? (
            <Alert tone="danger">
              {shareError}
              <Button variant="quiet" onClick={() => setShareRetry((value) => value + 1)}>
                Try again
              </Button>
            </Alert>
          ) : !shareUrl ? (
            <p role="status">Creating recording link…</p>
          ) : (
            <div className={styles.shareLink}>
              <TextField
                className={styles.shareField}
                label="Recording link"
                value={shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                loading={copyStatus === "copying"}
                loadingLabel="Copying…"
                onClick={async () => {
                  setCopyStatus("copying");
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopyStatus("copied");
                  } catch {
                    setCopyStatus("error");
                  }
                }}
              >
                {copyStatus === "copied" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copyStatus === "copied" ? "Copied" : "Copy link"}
              </Button>
            </div>
          )}
          <p role="status" className={copyStatus === "error" ? styles.copyError : "ds-sr-only"}>
            {copyStatus === "copied"
              ? "Recording link copied."
              : copyStatus === "error"
                ? "We couldn’t copy the link. Select the recording link and copy it manually."
                : ""}
          </p>
        </Stack>
      </Dialog>
    </div>
  );
}
