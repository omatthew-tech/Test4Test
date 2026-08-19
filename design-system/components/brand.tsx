import type { SVGProps } from "react";
import { Link as RouterLink } from "react-router-dom";
import styles from "./components.module.css";

// One arc of the exchange loop. The opposing arc is the same outline rotated a
// half turn about the glyph centre, so both halves stay identical by definition.
const LOOP_ARC =
  "M146 436L146 353A199 199 0 0 1 345 154L679 154A199 199 0 0 1 878 353L878 420L911.06 420A12 12 0 0 1 919.75 440.26L832.7 531.85A12 12 0 0 1 815.3 531.85L728.25 440.26A12 12 0 0 1 736.94 420L770 420L770 366A104 104 0 0 0 666 262L358 262A104 104 0 0 0 254 366L254 436A10 10 0 0 1 244 446L216.8 425.6A28 28 0 0 0 183.2 425.6L156 446A10 10 0 0 1 146 436Z";

export function Test4TestMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="85 154 854 681" aria-hidden="true" focusable="false" {...props}>
      <path fill="currentColor" d={LOOP_ARC} />
      <path fill="currentColor" fillOpacity="0.84" transform="rotate(180 512 494.5)" d={LOOP_ARC} />
    </svg>
  );
}

export interface Test4TestBrandProps {
  to?: string;
  className?: string;
  compact?: boolean;
}

export function Test4TestBrand({ to = "/", className = "", compact = false }: Test4TestBrandProps) {
  return (
    <RouterLink
      className={`${styles.brand} ${className}`.trim()}
      to={to}
      aria-label="Test4Test home"
    >
      <Test4TestMark className={styles.brandMark} />
      {!compact && <span className={styles.brandWord}>Test4Test</span>}
    </RouterLink>
  );
}
