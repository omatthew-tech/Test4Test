import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ScanLine } from "lucide-react";
import type { UsabilityReportPreviewFrame } from "../../types";

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
  screenshots?: UsabilityReportPreviewFrame[];
}

export function ProcessingScreen({ productName, screenshots }: ProcessingScreenProps) {
  const screens = Array.from({ length: SCREEN_COUNT }, (_, index) => index);
  const [slots, setSlots] = useState<Array<UsabilityReportPreviewFrame | null>>(
    () => Array.from({ length: SCREEN_COUNT }, () => null),
  );
  const previewFrames = useMemo(
    () => (screenshots ?? []).filter((frame) => frame.id && frame.url).slice(0, 16),
    [screenshots],
  );
  const previewFramesRef = useRef<UsabilityReportPreviewFrame[]>(previewFrames);
  const cursorRef = useRef(0);
  const replacementSlotRef = useRef(0);

  useEffect(() => {
    previewFramesRef.current = previewFrames;
    const latestById = new Map(previewFrames.map((frame) => [frame.id, frame]));

    setSlots((current) => current.map((slot) => (slot ? latestById.get(slot.id) ?? slot : slot)));
  }, [previewFrames]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlots((current) => {
        const frames = previewFramesRef.current;

        if (frames.length === 0) {
          return current;
        }

        const occupiedIds = new Set(current.filter(Boolean).map((slot) => slot!.id));
        const emptyIndex = current.findIndex((slot) => !slot);
        const nextFrame =
          frames.find((frame) => !occupiedIds.has(frame.id)) ??
          frames[cursorRef.current % frames.length];

        if (!nextFrame) {
          return current;
        }

        cursorRef.current += 1;

        if (emptyIndex >= 0) {
          const next = [...current];
          next[emptyIndex] = nextFrame;
          return next;
        }

        const replacementIndex = replacementSlotRef.current % SCREEN_COUNT;
        replacementSlotRef.current += 1;

        if (
          current[replacementIndex]?.id === nextFrame.id &&
          current[replacementIndex]?.url === nextFrame.url
        ) {
          return current;
        }

        const next = [...current];
        next[replacementIndex] = nextFrame;
        return next;
      });
    }, 2200);

    return () => window.clearInterval(timer);
  }, []);

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
            const screenshot = slots[index];
            const style = {
              "--screen-index": index,
              "--screen-offset": offset,
              "--screen-abs": Math.abs(offset),
              "--screen-count": SCREEN_COUNT,
            } as CSSProperties;

            return (
              <div
                key={index}
                className={`report-screen${screenshot ? " report-screen--filled" : ""}`}
                style={style}
              >
                {screenshot ? (
                  <img
                    key={screenshot.id}
                    className="report-screen__shot"
                    src={screenshot.url}
                    alt=""
                    loading="lazy"
                  />
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
        <p className="report-processing__hint">You can close this tab and check back later</p>
      </div>
    </section>
  );
}
