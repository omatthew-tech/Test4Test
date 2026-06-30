import { type CSSProperties } from "react";
import { ScanLine } from "lucide-react";

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

const SCREEN_COUNT = 5;

export interface ProcessingScreenProps {
  /** Optional product name to personalize the copy. */
  productName?: string;
  /** Live status label, e.g. how many frames found so far. */
  statusLabel?: string;
  /** Optional real screenshot URLs to feature in the stack (falls back to mocks). */
  screenshots?: string[];
}

export function ProcessingScreen({ productName, screenshots }: ProcessingScreenProps) {
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
        <h2 className="report-processing__title">
          Analyzing {productName ? <strong>{productName}</strong> : "your recordings"}…
        </h2>
      </div>
    </section>
  );
}
