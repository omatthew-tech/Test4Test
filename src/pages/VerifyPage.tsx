import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Stack, TextField } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import {
  getStoredOtpChallenge,
  getSubmitFlowResume,
  saveSubmitFlowResume,
} from "../lib/pendingSubmission";
import { isTestAccountEmail } from "../lib/supabase";
import styles from "./AuthPage.module.css";

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
  const isTestAccountChallenge = isTestAccountEmail(email);
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
      await requestOtp(email, {
        intent: storedChallenge?.intent ?? (submissionId ? "founder_signup" : "sign_in"),
        submissionId,
      });
      setMessage(
        isTestAccountChallenge
          ? "Enter the configured test account passcode."
          : "New code sent. Check your email for the latest code.",
      );
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
        <Button
          type="button"
          className={styles.back}
          variant="quiet"
          disabled={isSendingCode || isVerifying}
          onClick={handleChangeEmail}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Change email
        </Button>
        <Stack className={styles.copy} gap="sm">
          <h2>{isTestAccountChallenge ? "Enter test passcode" : "Enter the six-digit code"}</h2>
          {isTestAccountChallenge ? (
            <p>
              Enter the configured test account passcode for{" "}
              <strong>{email || "your email"}</strong>.
            </p>
          ) : (
            <p>
              We sent a code to <strong>{email || "your email"}</strong>. Enter it here to finish
              verifying your account.
            </p>
          )}
        </Stack>
        <TextField
          autoComplete="one-time-code"
          className={styles.codeInput}
          inputMode="numeric"
          label={isTestAccountChallenge ? "Test account passcode" : "One-time passcode"}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          value={code}
        />
        {message ? <Alert>{message}</Alert> : null}
        <div className={styles.actions}>
          <Button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying || isSendingCode || !code.trim()}
            loading={isVerifying}
            loadingLabel="Verifying"
          >
            Verify and continue
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void resend()}
            disabled={isSendingCode || isVerifying}
            loading={isSendingCode}
            loadingLabel={isTestAccountChallenge ? "Resetting" : "Sending"}
          >
            <RefreshCcw aria-hidden="true" size={16} />
            {isTestAccountChallenge ? "Restart" : "Resend code"}
          </Button>
        </div>
      </VerificationFlowShell>
    </AppShell>
  );
}
