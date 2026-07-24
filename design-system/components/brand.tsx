import type { SVGProps } from "react";
import { Link as RouterLink } from "react-router-dom";
import styles from "./components.module.css";

export function Test4TestMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...props}>
      <path fill="currentColor" d="M5 4h22v7H19v17h-7V11H5z" />
      <path fill="currentColor" fillOpacity="0.3" d="M20 13h7v7h-7zM5 21h7v7H5z" />
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
