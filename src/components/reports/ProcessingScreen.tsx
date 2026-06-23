import { useEffect, useState, type CSSProperties } from "react";
import { ScanLine, Sparkles } from "lucide-react";

/**
 * Full-bleed processing screen shown while the backend extracts and analyzes
 * screenshots.
 *
 * The centerpiece is an "oscillating screenshots" animation: a fanned stack of
 * mock app screens that continuously sweep left/right while a scan line passes
 * over the active card, simulating an AI systematically working through the
 * recording. It is pure CSS (see `.report-processing__*` rules in styles.css)
 * and honors `prefers-reduced-motion`.
 */

const ANALYSIS_STEPS = [
  "Fetching usability recordings",
  "Splitting video into app screens",
  "Detecting unique pages",
  "Timestamping each screenshot",
  "Compiling your report",
];

const SCREEN_COUNT = 5;

export interface ProcessingScreenProps {
  /** Optional product name to personalize the copy. */
  productName?: string;
  /** Live status label, e.g. how many frames found so far. */
  statusLabel?: string;
  /** Optional real screenshot URLs to feature in the stack (falls back to mocks). */
  screenshots?: string[];
}

export function ProcessingScreen({ productName, statusLabel, screenshots }: ProcessingScreenProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((step) => (step + 1) % ANALYSIS_STEPS.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, []);

  const screens = Array.from({ length: SCREEN_COUNT }, (_, index) => index);

  return (
    <section
      className="report-processing"
      role="status"
      aria-live="polite"
      aria-label="Generating usability report"
    >
      <div className="report-processing__stage" aria-hidden="true">
        <div className="report-processing__glow" />

        <div className="report-processing__deck">
          {screens.map((index) => {
            const offset = index - (SCREEN_COUNT - 1) / 2;
            const screenshot = screenshots?.[index];
            const style = {
              "--screen-index": index,
              "--screen-offset": offset,
              "--screen-abs": Math.abs(offset),
              "--screen-count": SCREEN_COUNT,
            } as CSSProperties;

            return (
              <div key={index} className="report-screen" style={style}>
                {screenshot ? (
                  <img className="report-screen__shot" src={screenshot} alt="" loading="lazy" />
                ) : (
                  <div className="report-screen__mock">
                    <span className="report-screen__bar report-screen__bar--title" />
                    <span className="report-screen__bar report-screen__bar--wide" />
                    <span className="report-screen__bar report-screen__bar--medium" />
                    <span className="report-screen__bar report-screen__bar--block" />
                    <span className="report-screen__bar report-screen__bar--short" />
                  </div>
                )}
                <span className="report-screen__scan">
                  <ScanLine size={18} strokeWidth={2.2} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="report-processing__copy">
        <span className="report-processing__eyebrow">
          <Sparkles size={16} strokeWidth={2.4} />
          AI analysis in progress
        </span>
        <h2 className="report-processing__title">
          Analyzing {productName ? <strong>{productName}</strong> : "your recordings"}…
        </h2>
        <p className="report-processing__subtitle">
          {statusLabel ?? "We're scanning each recording to capture every unique app page."}
        </p>

        <ol className="report-processing__steps">
          {ANALYSIS_STEPS.map((step, index) => {
            const state =
              index === activeStep ? "active" : index < activeStep ? "done" : "upcoming";
            return (
              <li
                key={step}
                className={`report-processing__step report-processing__step--${state}`}
              >
                <span className="report-processing__step-dot" aria-hidden="true" />
                {step}
              </li>
            );
          })}
        </ol>

        <p className="report-processing__hint">
          This can take a minute or two. You'll be redirected automatically when it's ready.
        </p>
      </div>
    </section>
  );
}
