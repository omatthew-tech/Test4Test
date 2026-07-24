import type { ReactNode } from "react";
import { Card, StatusIndicator, type StatusTone } from "./data-display";
import { Cluster, Stack } from "./layout";
import { Progress } from "./feedback";
import { Textarea } from "./inputs";
import styles from "./components.module.css";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        {eyebrow}
        <h1 className={styles.pageTitle}>{title}</h1>
        {description && <p className={styles.pageDescription}>{description}</p>}
      </div>
      {actions && <Cluster>{actions}</Cluster>}
    </header>
  );
}

export interface Step {
  id: string;
  label: string;
}

export function Stepper({ steps, currentStep }: { steps: Step[]; currentStep: string }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  return (
    <ol className={styles.stepper} aria-label="Progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`${styles.step} ${index === currentIndex ? styles.stepCurrent : ""} ${
            index < currentIndex ? styles.stepComplete : ""
          }`.trim()}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function RatingControl({
  legend,
  name,
  value,
  onChange,
  min = 1,
  max = 5,
  disabled = false,
}: {
  legend: string;
  name: string;
  value?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.rating}>
      <legend>{legend}</legend>
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((option) => (
        <span className={styles.ratingOption} key={option}>
          <input
            id={`${name}-${option}`}
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          <label htmlFor={`${name}-${option}`}>{option}</label>
        </span>
      ))}
    </fieldset>
  );
}

export function RecordingStatus({
  status,
  description,
  progress,
  tone,
}: {
  status: ReactNode;
  description: ReactNode;
  progress?: number;
  tone?: StatusTone;
}) {
  const statusTone = tone ?? (progress === 100 ? "success" : "info");
  return (
    <div className={styles.recordingStatus} aria-live="polite">
      <StatusIndicator tone={statusTone}>{status}</StatusIndicator>
      <p>{description}</p>
      {typeof progress === "number" && <Progress label="Recording upload" value={progress} />}
    </div>
  );
}

export function TestRow({
  title,
  metadata,
  status,
  statusTone = "neutral",
  actions,
}: {
  title: ReactNode;
  metadata?: ReactNode;
  status?: ReactNode;
  statusTone?: StatusTone;
  actions?: ReactNode;
}) {
  return (
    <Card as="article" className={styles.testRow}>
      <Stack className={styles.testRowMain} gap="sm">
        <h2 className={styles.testRowTitle}>{title}</h2>
        {metadata && <div className={styles.testRowMeta}>{metadata}</div>}
        {status && <StatusIndicator tone={statusTone}>{status}</StatusIndicator>}
      </Stack>
      {actions && <Cluster>{actions}</Cluster>}
    </Card>
  );
}

export interface QuestionEditorProps {
  id?: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  helpText?: ReactNode;
  error?: ReactNode;
  actions?: ReactNode;
  disabled?: boolean;
}

export function QuestionEditor({
  id,
  label,
  value,
  onChange,
  helpText,
  error,
  actions,
  disabled,
}: QuestionEditorProps) {
  return (
    <Card as="section" className={styles.questionEditor}>
      <Textarea
        id={id}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        helpText={helpText}
        error={error}
        disabled={disabled}
      />
      {actions && <Cluster>{actions}</Cluster>}
    </Card>
  );
}

export interface ResponseViewerProps {
  question: ReactNode;
  response: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
}

export function ResponseViewer({ question, response, metadata, actions }: ResponseViewerProps) {
  return (
    <Card as="article" className={styles.responseViewer}>
      <Stack gap="sm">
        <h2 className={styles.responseQuestion}>{question}</h2>
        {metadata && <div className={styles.responseMetadata}>{metadata}</div>}
        <div className={styles.responseContent}>{response}</div>
      </Stack>
      {actions && <Cluster>{actions}</Cluster>}
    </Card>
  );
}
