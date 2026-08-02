import { useEffect, useState } from "react";
import { ArrowLeft, Mail, MailCheck, RefreshCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import { isTestAccountEmail } from "../lib/supabase";
import { wait } from "../lib/timing";

function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function sanitizeEmail(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, requestOtp, state, verifyOtp } = useAppState();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const invitedEmail = sanitizeEmail(searchParams.get("email"));
  const activeChallenge = state.otpChallenge && !state.otpChallenge.submissionId ? state.otpChallenge : null;
  const [email, setEmail] = useState(activeChallenge?.email ?? invitedEmail);
  const isCurrentEmailTestAccount = isTestAccountEmail(email);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasRequestedCode, setHasRequestedCode] = useState(Boolean(activeChallenge?.email));

  useEffect(() => {
    if (currentUser) {
      navigate(currentUser.banStatus === "banned" ? "/banned" : returnTo ?? "/earn", { replace: true });
    }
  }, [currentUser, navigate, returnTo]);

  useEffect(() => {
    if (activeChallenge?.email) {
      setEmail(activeChallenge.email);
      setHasRequestedCode(true);
    }
  }, [activeChallenge?.email]);

  const handleRequestCode = async () => {
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      setMessage("Add your email address to get a sign-in code.");
      return;
    }

    setIsSendingCode(true);
    try {
      const waitForSendUi = isTestAccountEmail(nextEmail) ? Promise.resolve() : wait(5000);
      await Promise.all([requestOtp(nextEmail), waitForSendUi]);
      setEmail(nextEmail);
      setHasRequestedCode(true);
      setCode("");
      setMessage(
        isTestAccountEmail(nextEmail)
          ? "Enter the configured test account passcode."
          : "We sent a one-time code to your email.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send a sign-in code right now.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const result = await verifyOtp(code);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not verify that code.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleChangeEmail = () => {
    setHasRequestedCode(false);
    setCode("");
    setMessage("");
  };

  return (
    <AppShell eyebrowLabel={null} headerVariant="marketing">
      <VerificationFlowShell title="Sign in" cardClassName="sign-in-panel" hideTitle>
        {hasRequestedCode ? (
          <>
            <button
              type="button"
              className="button button--ghost sign-in-back-button"
              onClick={handleChangeEmail}
              disabled={isSendingCode || isVerifying}
            >
              <ArrowLeft size={16} />
              Change email
            </button>
            <h2>{isCurrentEmailTestAccount ? "Enter test passcode" : "Check your email"}</h2>
            {isCurrentEmailTestAccount ? (
              <p>
                Enter the configured test account passcode for <strong>{email || "your email"}</strong>.
              </p>
            ) : (
              <p>
                We sent a six-digit code to <strong>{email || "your email"}</strong>. Enter it below to sign in.
              </p>
            )}
            <label className="field field--otp">
              <span>{isCurrentEmailTestAccount ? "Test account passcode" : "One-time passcode"}</span>
              <div className="otp-row">
                <MailCheck size={18} />
                <input
                  className="otp-row__input"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                />
              </div>
            </label>
            {message ? <div className="callout callout--soft">{message}</div> : null}
            <div className="inline-actions verify-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void handleRequestCode()}
                disabled={isSendingCode || isVerifying}
              >
                {isSendingCode ? (
                  <span className="button__spinner" aria-hidden="true" />
                ) : (
                  <RefreshCcw size={16} />
                )}
                {isSendingCode
                  ? isCurrentEmailTestAccount
                    ? "Resetting..."
                    : "Sending..."
                  : isCurrentEmailTestAccount
                    ? "Restart"
                    : "Resend code"}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleVerify()}
                disabled={isVerifying || isSendingCode || !code.trim()}
              >
                Verify and continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Sign in with email</h2>
            <p>
              {isCurrentEmailTestAccount
                ? "Enter the test account email to continue."
                : "Enter your email and we'll send you a one-time code."}
            </p>
            <label className="field sign-in-panel__field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            {message ? <div className="callout callout--soft">{message}</div> : null}
            <div className="inline-actions sign-in-panel__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleRequestCode()}
                disabled={isSendingCode || !email.trim()}
              >
                {isSendingCode ? (
                  <span className="button__spinner" aria-hidden="true" />
                ) : (
                  <Mail size={16} />
                )}
                {isSendingCode
                  ? isCurrentEmailTestAccount
                    ? "Opening..."
                    : "Sending..."
                  : isCurrentEmailTestAccount
                    ? "Continue"
                    : "Send one-time code"}
              </button>
            </div>
            <div className="sign-in-panel__footer">
              <button type="button" className="button button--secondary" onClick={() => navigate("/submit")}>
                Sign up
              </button>
            </div>
          </>
        )}
      </VerificationFlowShell>
    </AppShell>
  );
}
