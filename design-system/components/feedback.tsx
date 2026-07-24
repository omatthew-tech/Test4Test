import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import styles from "./components.module.css";

export type FeedbackTone = "info" | "success" | "warning" | "danger";
const toneClasses: Record<FeedbackTone, string> = {
  info: styles.alertInfo,
  success: styles.alertSuccess,
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};
const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: FeedbackTone;
  title?: ReactNode;
}

export function Alert({ tone = "info", title, className = "", children, ...props }: AlertProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      className={`${styles.alert} ${toneClasses[tone]} ${className}`.trim()}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <Icon aria-hidden="true" size={20} />
      <div>
        {title && <div className={styles.alertTitle}>{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export interface ToastProps extends AlertProps {
  open: boolean;
}

export function Toast({ open, tone = "info", ...props }: ToastProps) {
  if (!open) return null;
  return <Alert className={styles.toast} tone={tone} {...props} />;
}

export interface InlineValidationProps {
  id?: string;
  children: ReactNode;
}

export function InlineValidation({ id, children }: InlineValidationProps) {
  return (
    <span id={id} className={styles.error}>
      <AlertCircle aria-hidden="true" size={16} />
      <span>{children}</span>
    </span>
  );
}

export interface FormSummaryItem {
  fieldId: string;
  message: string;
}

export interface FormSummaryProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  items: FormSummaryItem[];
}

export const FormSummary = forwardRef<HTMLDivElement, FormSummaryProps>(function FormSummary(
  { title = "Review the highlighted fields", items, className = "", ...props },
  ref,
) {
  const titleId = useId();
  if (items.length === 0) return null;
  return (
    <div
      ref={ref}
      className={`${styles.formSummary} ${className}`.trim()}
      role="alert"
      aria-labelledby={titleId}
      tabIndex={-1}
      {...props}
    >
      <h2 className={styles.formSummaryTitle} id={titleId}>
        {title}
      </h2>
      <ul className={styles.formSummaryList}>
        {items.map((item) => (
          <li key={`${item.fieldId}-${item.message}`}>
            <a
              href={`#${item.fieldId}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(item.fieldId)?.focus();
              }}
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

export interface ProgressProps {
  label: ReactNode;
  value?: number;
  max?: number;
}

export function Progress({ label, value, max = 100 }: ProgressProps) {
  const labelId = useId();
  const determinate = typeof value === "number";
  return (
    <div className={styles.progressGroup}>
      <div className={styles.progressHeader}>
        <span id={labelId}>{label}</span>
        {determinate && <span>{Math.round((value / max) * 100)}%</span>}
      </div>
      <progress
        className={styles.progress}
        value={determinate ? value : undefined}
        max={max}
        aria-labelledby={labelId}
      >
        {determinate ? `${Math.round((value / max) * 100)}%` : "In progress"}
      </progress>
    </div>
  );
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function Skeleton({ label = "Loading content", className = "", ...props }: SkeletonProps) {
  return (
    <div className={`${styles.skeleton} ${className}`.trim()} aria-hidden="true" {...props}>
      <span className="ds-sr-only">{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyMark} aria-hidden="true">
        {icon ?? <Info size={24} />}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
