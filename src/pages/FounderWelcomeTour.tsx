import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, Stack, Stepper } from "@test4test/design-system";
import type { FounderWelcomeOutcome } from "../lib/founderWelcome";
import styles from "./FounderWelcomeTour.module.css";

const screens = [
  {
    title: "Welcome to Test4Test",
    body: "Did you know xyz says 82% of UX researchers use live recordings because it's the most effective way to improve an app's experience?",
  },
  {
    title: "How to earn credits",
    body: "Every time you test someone's app, your app will rank up on the earn page and that user will need to test back in order to see your feedback",
  },
  {
    title: "Share your test",
    body: "Share your test with as many as users as you want! There are currently no limits or credit cards required",
  },
  {
    title: "Review your feedback",
    body: "Watch your recordings or export a context report for your favorite LLM. You can also share recordings, create clips and highlight key moments",
  },
];
const steps = screens.slice(1).map((screen) => ({ id: screen.title, label: screen.title }));

export function FounderWelcomeTour({
  onFinish,
}: {
  onFinish: (outcome: FounderWelcomeOutcome) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failedOutcome, setFailedOutcome] = useState<FounderWelcomeOutcome | null>(null);
  const inFlight = useRef(false);
  const heading = useRef<HTMLSpanElement>(null);
  const screen = screens[step];

  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const finish = async (outcome: FounderWelcomeOutcome) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailedOutcome(null);
    try {
      await onFinish(outcome);
    } catch {
      setFailedOutcome(outcome);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      className={styles.tour}
      onOpenChange={(open) => {
        if (!open) void finish("dismissed");
      }}
      title={
        <span ref={heading} tabIndex={-1}>
          {screen.title}
        </span>
      }
      headerAccessory={
        <div className={styles.progress}>
          {step > 0 ? <Stepper variant="dots" steps={steps} currentStep={screen.title} /> : null}
        </div>
      }
      footer={
        <Button
          className={styles.next}
          disabled={saving}
          loading={saving}
          loadingLabel="Saving"
          onClick={() => {
            if (step === screens.length - 1) void finish("completed");
            else {
              setFailedOutcome(null);
              setStep((current) => current + 1);
            }
          }}
        >
          {step === screens.length - 1 ? "Get started" : "Next"}
        </Button>
      }
    >
      <Stack gap="md" aria-busy={saving}>
        <p>{screen.body}</p>
        {failedOutcome ? (
          <Alert tone="danger">
            <Stack gap="sm">
              <p>We could not save your choice. Please try again.</p>
              <Button variant="secondary" onClick={() => void finish(failedOutcome)}>
                Try again
              </Button>
            </Stack>
          </Alert>
        ) : null}
      </Stack>
    </Dialog>
  );
}
