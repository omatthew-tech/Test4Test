import { useEffect, useState } from "react";
import { ArrowLeft, Mail, RefreshCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Stack, TextField } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { VerificationFlowShell } from "../components/VerificationFlowShell";
import { useAppState } from "../context/AppStateContext";
import { isTestAccountEmail } from "../lib/supabase";
import { wait } from "../lib/timing";
import styles from "./AuthPage.module.css";

function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, requestOtp, state, verifyOtp } = useAppState();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const activeChallenge =
    state.otpChallenge && !state.otpChallenge.submissionId ? state.otpChallenge : null;
  const [email, setEmail] = useState(activeChallenge?.email ?? "");
  const isCurrentEmailTestAccount = isTestAccountEmail(email);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasRequestedCode, setHasRequestedCode] = useState(Boolean(activeChallenge?.email));

  useEffect(() => {
    if (currentUser) {
      navigate(currentUser.banStatus === "banned" ? "/banned" : (returnTo ?? "/earn"), {
        replace: true,
      });
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
      setMessage(
        error instanceof Error ? error.message : "We could not send a sign-in code right now.",
      );
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
            <Button
              type="button"
              className={styles.back}
              variant="quiet"
              onClick={handleChangeEmail}
              disabled={isSendingCode || isVerifying}
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Change email
            </Button>
            <Stack className={styles.copy} gap="sm">
              <h2>{isCurrentEmailTestAccount ? "Enter test passcode" : "Check your email"}</h2>
              {isCurrentEmailTestAccount ? (
                <p>
                  Enter the configured test account passcode for{" "}
                  <strong>{email || "your email"}</strong>.
                </p>
              ) : (
                <p>
                  We sent a six-digit code to <strong>{email || "your email"}</strong>. Enter it
                  below to sign in.
                </p>
              )}
            </Stack>
            <TextField
              autoComplete="one-time-code"
              className={styles.codeInput}
              inputMode="numeric"
              label={isCurrentEmailTestAccount ? "Test account passcode" : "One-time passcode"}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              value={code}
            />
            {message ? <Alert>{message}</Alert> : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleRequestCode()}
                disabled={isSendingCode || isVerifying}
                loading={isSendingCode}
                loadingLabel={isCurrentEmailTestAccount ? "Resetting" : "Sending"}
              >
                <RefreshCcw aria-hidden="true" size={16} />
                {isCurrentEmailTestAccount ? "Restart" : "Resend code"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleVerify()}
                disabled={isVerifying || isSendingCode || !code.trim()}
                loading={isVerifying}
                loadingLabel="Verifying"
              >
                Verify and continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <Stack className={styles.copy} gap="sm">
              <h2>Sign in with email</h2>
              <p>
                {isCurrentEmailTestAccount
                  ? "Enter the test account email to continue."
                  : "Enter your email and we'll send you a one-time code."}
              </p>
            </Stack>
            <TextField
              autoComplete="email"
              label="Email address"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            {message ? <Alert>{message}</Alert> : null}
            <div className={styles.actions}>
              <Button
                type="button"
                onClick={() => void handleRequestCode()}
                disabled={isSendingCode || !email.trim()}
                loading={isSendingCode}
                loadingLabel={isCurrentEmailTestAccount ? "Opening" : "Sending"}
              >
                <Mail aria-hidden="true" size={16} />
                {isCurrentEmailTestAccount ? "Continue" : "Send one-time code"}
              </Button>
            </div>
            <div className={styles.footer}>
              <p>New to Test4Test?</p>
              <Button type="button" variant="secondary" onClick={() => navigate("/submit")}>
                Sign up
              </Button>
            </div>
          </>
        )}
      </VerificationFlowShell>
    </AppShell>
  );
}
