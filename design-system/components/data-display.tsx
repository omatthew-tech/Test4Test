import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import styles from "./components.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  raised?: boolean;
}

export function Card({ as = "div", raised = false, className = "", ...props }: CardProps) {
  return createElement(as, {
    ...props,
    className: `${styles.card} ${raised ? styles.cardRaised : ""} ${className}`.trim(),
  });
}

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: "default" | "subtle" | "raised";
  padding?: "none" | "compact" | "default";
}

export function Surface({
  as = "div",
  tone = "default",
  padding = "default",
  className = "",
  ...props
}: SurfaceProps) {
  return createElement(as, {
    ...props,
    className:
      `${styles.surface} ${styles[`surfaceTone${tone[0].toUpperCase()}${tone.slice(1)}`]} ${styles[`surfacePadding${padding[0].toUpperCase()}${padding.slice(1)}`]} ${className}`.trim(),
  });
}

export function Table({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function List({
  ordered = false,
  children,
  className = "",
}: {
  ordered?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Element = ordered ? "ol" : "ul";
  return <Element className={`${styles.plainList} ${className}`.trim()}>{children}</Element>;
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
const toneClasses: Record<StatusTone, string> = {
  neutral: "",
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`${styles.badge} ${toneClasses[tone]}`.trim()}>{children}</span>;
}

export function StatusIndicator({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`${styles.status} ${toneClasses[tone]}`.trim()}>
      <span className={styles.statusDot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function TechnicalValue({
  children,
  as = "code",
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return createElement(as, { className: `${styles.technical} ${className}`.trim() }, children);
}
