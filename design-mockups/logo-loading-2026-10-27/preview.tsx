import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Cluster, Stack, Test4TestMark } from "@test4test/design-system";
import styles from "./preview.module.css";

// The centerline follows the canonical mark's two arcs: x=200..824, y=208..781.
// Only the arrows advance along this fixed geometry; the SVG never rotates.
const LOOP_PATH =
  "M824 494.5V631A150 150 0 0 1 674 781H350A150 150 0 0 1 200 631V358A150 150 0 0 1 350 208H674A150 150 0 0 1 824 358Z";
const ARROW_HEAD = "M-108-88Q-108-104-96-92L-8-9Q1 0-8 9L-96 92Q-108 104-108 88Z";

// Tier 2 design preview: compose existing layout primitives with brand geometry.
// This entry is independent of production routing and loading behavior.
function LoadingPreview() {
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const loopRef = useRef<SVGPathElement>(null);
  const firstArrowRef = useRef<SVGGElement>(null);
  const secondArrowRef = useRef<SVGGElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const loop = loopRef.current;
    const firstArrow = firstArrowRef.current;
    const secondArrow = secondArrowRef.current;
    if (!loop || !firstArrow || !secondArrow) return;

    const length = loop.getTotalLength();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const token = getComputedStyle(loop)
      .getPropertyValue("--ds-semantic-motion-interaction-duration")
      .trim();
    // logo-loading-preview-motion: twelve semantic feedback beats per circuit.
    const duration = parseFloat(token) * (token.endsWith("ms") ? 1 : 1000) * 12;
    let frame = 0;
    let previousTime: number | undefined;

    const paint = () => {
      const phase = phaseRef.current;
      loop.setAttribute("stroke-dashoffset", String(47 - phase * 100));
      [firstArrow, secondArrow].forEach((arrow, index) => {
        const distance = ((phase + index / 2) % 1) * length;
        const point = loop.getPointAtLength(distance);
        const ahead = loop.getPointAtLength((distance + 1) % length);
        const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
        arrow.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
      });
    };
    const tick = (time: number) => {
      if (previousTime !== undefined) {
        phaseRef.current = (phaseRef.current + (time - previousTime) / duration) % 1;
      }
      previousTime = time;
      paint();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      previousTime = undefined;
      if (complete || preference.matches) phaseRef.current = 0;
      paint();
      if (!paused && !complete && !preference.matches && !document.hidden) {
        frame = requestAnimationFrame(tick);
      }
    };

    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, complete]);

  return (
    <div className={styles.preview}>
      <main className={styles.stage}>
        <h1 className="ds-sr-only">Loading animation preview</h1>
        <Stack gap="lg" className={styles.loading} role="status" aria-atomic="true">
          <div className={styles.markFrame}>
            <div className={styles.mark} data-complete={complete}>
              <svg
                className={styles.movingMark}
                viewBox="85 98 854 793"
                aria-hidden="true"
                focusable="false"
                data-loading-loop="true"
              >
                <path
                  ref={loopRef}
                  d={LOOP_PATH}
                  pathLength="100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="108"
                  strokeDasharray="43 7"
                  strokeDashoffset="47"
                />
                <g ref={firstArrowRef} transform="translate(824 494.5) rotate(90)">
                  <path fill="currentColor" d={ARROW_HEAD} />
                </g>
                <g ref={secondArrowRef} transform="translate(200 494.5) rotate(-90)">
                  <path fill="currentColor" d={ARROW_HEAD} />
                </g>
              </svg>
              <Test4TestMark className={styles.staticMark} />
            </div>
          </div>
          <p className={styles.label}>{complete ? "Ready to go." : "Loading page…"}</p>
        </Stack>
      </main>
      <footer className={styles.controls} aria-label="Loading preview controls">
        <Stack gap="sm" className={styles.controlsContent}>
          <p className={styles.caption}>Test4Test · Loading preview</p>
          <Cluster className={styles.buttons}>
            <Button
              variant="secondary"
              disabled={complete}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume animation" : "Pause animation"}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setComplete((value) => !value);
                setPaused(false);
              }}
            >
              {complete ? "Replay loading" : "Finish preview"}
            </Button>
          </Cluster>
          <p className={styles.motionNote}>Your reduced-motion preference is respected.</p>
        </Stack>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<LoadingPreview />);
