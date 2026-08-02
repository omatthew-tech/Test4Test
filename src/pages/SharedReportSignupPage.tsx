import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  LockKeyhole,
  Mail,
  MailCheck,
  RefreshCcw,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import {
  getUsabilityReportInvitation,
  type UsabilityReportInvitation,
} from "../lib/reportInvites";

type SignupPhase = "email" | "otp" | "verified";

function initial(value: string) {
  return value.trim().charAt(0).toUpperCase() || "?";
}

export function SharedReportSignupPage() {
  const { shareId = "" } = useParams();
  const navigate = useNavigate();
  const { currentUser, isLoading: isAuthLoading, requestOtp, verifyOtp, signOut, state } = useAppState();
  const [invitation, setInvitation] = useState<UsabilityReportInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SignupPhase>("email");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);

    getUsabilityReportInvitation(shareId)
      .then((nextInvitation) => {
        if (!isCancelled) {
          setInvitation(nextInvitation);
        }
      })
      .catch((caught) => {
        if (!isCancelled) {
          setLoadError(
            caught instanceof Error
              ? caught.message
              : "This report invitation is invalid or no longer available.",
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (!invitation) {
      return;
    }

    const activeChallenge = state.otpChallenge;
    if (activeChallenge?.email.toLowerCase() === invitation.recipientEmail.toLowerCase()) {
      setPhase("otp");
    }
  }, [invitation, state.otpChallenge]);

  useEffect(() => {
    if (!invitation || isAuthLoading || !currentUser) {
      return;
    }

    if (currentUser.email.toLowerCase() === invitation.recipientEmail.toLowerCase()) {
      navigate(`/ai-analysis/${invitation.reportId}`, { replace: true });
    }
  }, [currentUser, invitation, isAuthLoading, navigate]);

  async function handleSendCode() {
    if (!invitation || isSending) {
      return;
    }

    setIsSending(true);
    setMessage("");

    try {
      await requestOtp(invitation.recipientEmail, undefined, invitation.recipientName);
      setCode("");
      setPhase("otp");
      setMessage("Code sent. Check your inbox for a six-digit code.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We could not send a sign-in code.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyCode() {
    if (!invitation || !code.trim() || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setMessage("");

    try {
      const result = await verifyOtp(code);
      setMessage(result.message);

      if (result.ok) {
        setPhase("verified");
        navigate(`/ai-analysis/${invitation.reportId}`, { replace: true });
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We could not verify that code.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleUseInvitedAccount() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  if (isLoading || isAuthLoading) {
    return (
      <main className="shared-report-page shared-report-page--state">
        <span className="button__spinner" aria-hidden="true" />
        <p>Loading your report invitation...</p>
      </main>
    );
  }

  if (loadError || !invitation) {
    return (
      <main className="shared-report-page shared-report-page--state">
        <div className="callout callout--warning" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{loadError ?? "This report invitation is invalid or no longer available."}</span>
        </div>
        <button type="button" className="button button--secondary" onClick={() => navigate("/")}>
          Go to Test4Test
        </button>
      </main>
    );
  }

  const hasDifferentSignedInUser = Boolean(
    currentUser
      && currentUser.email.toLowerCase() !== invitation.recipientEmail.toLowerCase(),
  );

  return (
    <main className="shared-report-page">
      <button type="button" className="shared-report-brand" onClick={() => navigate("/")}>
        <span className="shared-report-brand__orb" aria-hidden="true" />
        <strong>Test4Test</strong>
      </button>

      <div className="shared-report-layout">
        <section className="shared-report-intro">
          <div className="shared-report-sender">
            <span className="shared-report-sender__avatar" aria-hidden="true">
              {initial(invitation.senderName)}
            </span>
            <span className="shared-report-sender__text">
              <strong>{invitation.senderName} shared a report with you</strong>
              {invitation.senderEmail ? <span>{invitation.senderEmail}</span> : null}
            </span>
          </div>

          <div className="shared-report-headline">
            <h1>See the usability feedback on {invitation.productName}</h1>
            <p>
              {invitation.senderName} wants your take. Create a free account with the invited
              email to read the tester feedback and AI summary—no app submission required.
            </p>
          </div>

          <ul className="shared-report-perks">
            <li><Check size={18} aria-hidden="true" /> Free account with no app submission</li>
            <li><Check size={18} aria-hidden="true" /> Read tester feedback screen by screen</li>
            <li><Check size={18} aria-hidden="true" /> Use Test4Test’s other features whenever you’re ready</li>
          </ul>

          <div className="shared-report-signup">
            {hasDifferentSignedInUser ? (
              <div className="shared-report-signup__panel">
                <div className="shared-report-signup__head">
                  <h2>Use the invited email</h2>
                  <p>
                    You’re signed in as <strong>{currentUser?.email}</strong>, but this report was
                    shared with <strong>{invitation.recipientEmail}</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void handleUseInvitedAccount()}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "Switching..." : "Continue with invited email"}
                </button>
              </div>
            ) : phase === "email" ? (
              <div className="shared-report-signup__panel">
                <div className="shared-report-signup__head">
                  <h2>Sign up to view</h2>
                  <p>We’ll send a one-time code—no password or app submission needed.</p>
                </div>
                <label className="field">
                  <span>Invited email address</span>
                  <input type="email" value={invitation.recipientEmail} readOnly />
                </label>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void handleSendCode()}
                  disabled={isSending}
                >
                  {isSending ? <span className="button__spinner" aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
                  {isSending ? "Sending..." : "Send one-time code"}
                </button>
                {message ? <div className="callout callout--soft">{message}</div> : null}
              </div>
            ) : phase === "otp" ? (
              <div className="shared-report-signup__panel">
                <button
                  type="button"
                  className="shared-report-back"
                  onClick={() => {
                    setPhase("email");
                    setCode("");
                    setMessage("");
                  }}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Back
                </button>
                <div className="shared-report-signup__head">
                  <h2>Enter the six-digit code</h2>
                  <p>We sent a code to <strong>{invitation.recipientEmail}</strong>.</p>
                </div>
                <label className="field field--otp">
                  <span>One-time passcode</span>
                  <div className="otp-row">
                    <MailCheck size={18} aria-hidden="true" />
                    <input
                      value={code}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      onChange={(event) => {
                        setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                        setMessage("");
                      }}
                    />
                  </div>
                </label>
                {message ? <div className="callout callout--soft">{message}</div> : null}
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void handleVerifyCode()}
                  disabled={isVerifying || code.length !== 6}
                >
                  {isVerifying ? "Verifying..." : "Verify and view report"}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void handleSendCode()}
                  disabled={isSending || isVerifying}
                >
                  <RefreshCcw size={16} aria-hidden="true" />
                  {isSending ? "Sending..." : "Resend code"}
                </button>
              </div>
            ) : (
              <div className="shared-report-signup__panel">
                <div className="shared-report-signup__head">
                  <h2>You’re in</h2>
                  <p>Taking you to {invitation.reportName}...</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="shared-report-preview" aria-label="Locked report preview">
          <div className="shared-report-preview__inner" aria-hidden="true">
            <div className="shared-report-preview__row">
              <span className="shared-report-preview__title" />
              <span className="shared-report-preview__badge" />
            </div>
            <div className="shared-report-preview__metrics">
              {[0, 1, 2].map((index) => (
                <div key={index} className="shared-report-preview__metric">
                  <span /><strong />
                </div>
              ))}
            </div>
            <div className="shared-report-preview__quote"><span /><span /><span /></div>
            <div className="shared-report-preview__quote"><span /><span /></div>
          </div>
          <div className="shared-report-preview__lock">
            <span className="shared-report-preview__lock-badge" aria-hidden="true">
              <LockKeyhole size={24} />
            </span>
            <strong>Sign up to unlock {invitation.reportName}</strong>
            <span>The full feedback and summary appear after you verify your email.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
