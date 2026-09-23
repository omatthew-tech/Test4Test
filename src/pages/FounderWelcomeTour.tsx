import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  EarnTestCard,
  Link,
  Stack,
  Stepper,
  Surface,
} from "@test4test/design-system";
import type { FounderWelcomeOutcome } from "../lib/founderWelcome";
import styles from "./FounderWelcomeTour.module.css";

const screens = [
  {
    title: "Welcome to Test4Test!",
    body: (
      <>
        Did you know? According to{" "}
        <Link
          className={styles.source}
          to="https://humanfactors.jmir.org/2022/1/e31317/PDF"
          external
          target="_blank"
          rel="noopener noreferrer"
          aria-label="JMIR Human Factors study (opens in a new tab)"
        >
          <em>JMIR Human Factors</em>
        </Link>
        , &quot;recorded think-aloud testing identifies 77% of usability problems.&quot;
      </>
    ),
  },
  {
    title: "How to earn credits",
    body: "After you complete a test, your app ranks up and that user must test-back your app in order to unlock the feedback",
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
  appName = "Your app",
  appDescription = "Your selected app on the Earn page.",
  onFinish,
}: {
  appName?: string;
  appDescription?: string;
  onFinish: (outcome: FounderWelcomeOutcome) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failedOutcome, setFailedOutcome] = useState<FounderWelcomeOutcome | null>(null);
  const inFlight = useRef(false);
  const heading = useRef<HTMLSpanElement>(null);
  const shareDemo = useRef<HTMLVideoElement>(null);
  const [shareDemoFailed, setShareDemoFailed] = useState(false);
  const screen = screens[step];

  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    const video = shareDemo.current;
    if (step !== 2 || !video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    const pause = () => video.pause();
    const respectPreferences = () => {
      if (motion.matches || connection?.saveData || document.hidden) {
        pause();
      } else {
        void video.play().catch(() => {
          // Keep the poster when autoplay is unavailable.
        });
      }
    };
    respectPreferences();
    motion.addEventListener("change", respectPreferences);
    connection?.addEventListener("change", respectPreferences);
    document.addEventListener("visibilitychange", respectPreferences);
    return () => {
      pause();
      motion.removeEventListener("change", respectPreferences);
      connection?.removeEventListener("change", respectPreferences);
      document.removeEventListener("visibilitychange", respectPreferences);
    };
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
        <span ref={heading} tabIndex={-1} className={step === 0 ? styles.welcomeTitle : undefined}>
          {screen.title}
        </span>
      }
      headerAccessory={
        step > 0 ? (
          <div className={styles.progress}>
            <Stepper variant="dots" steps={steps} currentStep={screen.title} />
          </div>
        ) : undefined
      }
      footer={
        <div className={step > 0 ? `${styles.actions} ${styles.compactActions}` : styles.actions}>
          {step > 0 ? (
            <Button
              variant="secondary"
              size="large"
              disabled={saving}
              onClick={() => {
                if (inFlight.current) return;
                setFailedOutcome(null);
                setStep((current) => current - 1);
              }}
            >
              Back
            </Button>
          ) : null}
          <Button
            size={step > 0 ? "large" : "default"}
            disabled={saving}
            loading={saving}
            loadingLabel="Saving"
            onClick={() => {
              if (inFlight.current) return;
              if (step === screens.length - 1) void finish("completed");
              else {
                setFailedOutcome(null);
                setStep((current) => current + 1);
              }
            }}
          >
            {step === screens.length - 1 ? "Get started" : "Next"}
          </Button>
        </div>
      }
    >
      <Stack gap="md" aria-busy={saving}>
        {step === 0 ? (
          <img
            className={styles.welcomeImage}
            src="/images/home-hero-savanna.webp"
            width={1916}
            height={821}
            alt=""
          />
        ) : null}
        {step === 1 ? (
          <Surface
            tone="subtle"
            padding="compact"
            role="img"
            aria-label={`Example of ${appName} moving above two tests on Earn.`}
          >
            <div className={styles.rankPreview} aria-hidden="true">
              <EarnTestCard
                className={`${styles.rankCard} ${styles.rankOwner}`}
                title={<span className={styles.rankText}>{appName}</span>}
                description={<span className={styles.rankText}>{appDescription}</span>}
                badges={[{ id: "owner", label: "Your app", tone: "success" }]}
              />
              <EarnTestCard
                className={`${styles.rankCard} ${styles.rankPeer}`}
                title={<span className={styles.rankText}>Sprout Habit</span>}
                description={
                  <span className={styles.rankText}>
                    A habit-tracking app focused on gentle accountability and daily routines.
                  </span>
                }
                badges={[{ id: "ios", label: "iOS", tone: "info" }]}
              />
              <EarnTestCard
                className={`${styles.rankCard} ${styles.rankPeer}`}
                title={<span className={styles.rankText}>TrailMixer</span>}
                description={
                  <span className={styles.rankText}>
                    A trip-planning companion for stitching outdoor routes, packing lists, and
                    weather together.
                  </span>
                }
                badges={[
                  { id: "ios", label: "iOS", tone: "info" },
                  { id: "android", label: "Android", tone: "info" },
                ]}
              />
            </div>
          </Surface>
        ) : null}
        {step === 2 ? (
          <Stack gap="sm">
            <p className="ds-sr-only">
              Open Share in the navigation. In the Share Test4Test card, select Copy link. The
              button changes to Copied and the test link is ready to paste.
            </p>
            {shareDemoFailed ? (
              <img
                className={styles.welcomeImage}
                src="/videos/onboarding-share-test-poster.webp"
                width={1000}
                height={560}
                alt=""
              />
            ) : (
              <>
                {/* ds-exception: founder-share-demo-media */}
                <video
                  ref={shareDemo}
                  className={styles.welcomeImage}
                  src="/videos/onboarding-share-test.mp4"
                  poster="/videos/onboarding-share-test-poster.webp"
                  width={1000}
                  height={560}
                  loop
                  muted
                  playsInline
                  preload="none"
                  aria-hidden="true"
                  onError={() => setShareDemoFailed(true)}
                />
              </>
            )}
          </Stack>
        ) : null}
        {step === 3 ? (
          <img
            className={styles.welcomeImage}
            src="/images/onboarding-review-feedback.webp"
            width={824}
            height={440}
            alt="Create a clip from a recording: adjust the timeline handles, preview the selected range, then select Save clip."
          />
        ) : null}
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
