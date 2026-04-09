import { useEffect, useState } from "react";
import { ArrowLeft, MailCheck, RefreshCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import { getStoredOtpChallenge, getSubmitFlowResume, saveSubmitFlowResume } from "../lib/pendingSubmission";

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const storedChallenge = getStoredOtpChallenge();
  const storedResume = getSubmitFlowResume();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const email = searchParams.get("email") ?? storedChallenge?.email ?? storedResume?.email ?? "";
  const submissionId =
    searchParams.get("submissionId") ??
    storedChallenge?.submissionId ??
    storedResume?.submissionId ??
    undefined;
  const navigate = useNavigate();
  const { currentUser, requestOtp, verifyOtp } = useAppState();

  useEffect(() => {
    if (currentUser) {
      navigate(currentUser.banStatus === "banned" ? "/banned" : "/earn", { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!storedResume || !submissionId || !email) {
      return;
    }

    saveSubmitFlowResume({
      ...storedResume,
      phase: "verify-code",
      submissionId,
      email,
      updatedAt: new Date().toISOString(),
    });
  }, [email, storedResume, submissionId]);

  const resend = async () => {
    if (!email) {
      setMessage("Add an email in the submit flow before requesting a code.");
      return;
    }

    setIsSendingCode(true);

    try {
      await requestOtp(email, submissionId);
      setMessage("New code sent. Check your email for the latest code.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not resend that code.");
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
    if (storedResume) {
      saveSubmitFlowResume({
        ...storedResume,
        phase: "email",
        submissionId: submissionId ?? null,
        email,
        updatedAt: new Date().toISOString(),
      });
    }

    navigate(
      `/submit?phase=verify-email&email=${encodeURIComponent(email)}${
        submissionId ? `&submissionId=${encodeURIComponent(submissionId)}` : ""
      }`,
    );
  };

  return (
    <AppShell eyebrowLabel={null}>
      <VerificationFlowShell title="Verify your email" cardClassName="verify-panel">
        <button
          type="button"
          className="button button--ghost verify-back-button"
          disabled={isSendingCode || isVerifying}
          onClick={handleChangeEmail}
        >
          <ArrowLeft size={16} />
          Change Email
        </button>
        <h2>Enter the six-digit code</h2>
        <p>
          We sent a code to <strong>{email || "your email"}</strong>. Enter it here to finish verifying your account.
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
              autoComplete="one-time-code"
            />
          </div>
        </label>
        {message ? <div className="callout callout--soft">{message}</div> : null}
        <div className="inline-actions verify-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={handleVerify}
            disabled={isVerifying || isSendingCode || !code.trim()}
          >
            Verify and continue
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void resend()}
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
      </VerificationFlowShell>
    </AppShell>
  );
}


