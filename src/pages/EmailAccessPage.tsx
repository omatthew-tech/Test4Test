import { useEffect, useState } from "react";
import {
  Alert,
  ApplicationShell,
  Button,
  Container,
  Stack,
  Surface,
} from "@test4test/design-system";
import { EmailAccessError } from "../lib/emailAccess";
import styles from "./EmailAccessPage.module.css";

export function EmailAccessPage({ exchange }: { exchange: () => Promise<string> }) {
  const [failure, setFailure] = useState<EmailAccessError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    document.title = "Email sign-in | Test4Test";
    void exchange()
      .then((destination) => {
        if (active) window.location.replace(destination);
      })
      .catch((error: EmailAccessError) => {
        if (active) setFailure(error);
      });
    return () => {
      active = false;
    };
  }, [exchange, attempt]);

  return (
    <ApplicationShell mainClassName={styles.main}>
      <Container size="form">
        <Surface>
          <Stack gap="lg">
            <h1 className={styles.heading}>
              {failure ? "Email sign-in unavailable" : "Signing you in"}
            </h1>
            {failure ? (
              <>
                <Alert tone="danger">{failure.message}</Alert>
                {failure.retryable ? (
                  <Button
                    onClick={() => {
                      setFailure(null);
                      setAttempt((value) => value + 1);
                    }}
                  >
                    Try again
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => window.location.replace("/sign-in")}>
                  Sign in normally
                </Button>
              </>
            ) : (
              <Alert>Opening the test or feedback from your email…</Alert>
            )}
          </Stack>
        </Surface>
      </Container>
    </ApplicationShell>
  );
}
