import { useEffect, useState } from "react";
import { ArrowLeft, Mail, MailCheck, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import { wait } from "../lib/timing";

export function SignInPage() {
  const navigate = useNavigate();
  const { currentUser, requestOtp, state, verifyOtp } = useAppState();
  const activeChallenge = state.otpChallenge && !state.otpChallenge.submissionId ? state.otpChallenge : null;
  const [email, setEmail] = useState(activeChallenge?.email ?? "");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasRequestedCode, setHasRequestedCode] = useState(Boolean(activeChallenge?.email));

  useEffect(() => {
    if (currentUser) {
      navigate(currentUser.banStatus === "banned" ? "/banned" : "/earn", { replace: true });
    }
  }, [currentUser, navigate]);

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
      await Promise.all([requestOtp(nextEmail), wait(5000)]);
      setEmail(nextEmail);
      setHasRequestedCode(true);
      setCode("");
      setMessage("We sent a one-time code to your email.");
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
      <VerificationFlowShell title="Sign in" cardClassName="sign-in-panel">
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
            <h2>Check your email</h2>
            <p>
              We sent a six-digit code to <strong>{email || "your email"}</strong>. Enter it below to sign in.
            </p>
            <label className="field field--otp">
              <span>One-time passcode</span>
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
                className="button button--primary"
                onClick={() => void handleVerify()}
                disabled={isVerifying || isSendingCode || !code.trim()}
              >
                Verify and continue
              </button>
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
                {isSendingCode ? "Sending..." : "Resend code"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Sign in with email</h2>
            <p>Enter your email and we&apos;ll send you a one-time code.</p>
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
                {isSendingCode ? "Sending..." : "Send one-time code"}
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
