import { ArrowRight, Star } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { Button, Link } from "./actions";
import { Badge, Card, StatusIndicator, Surface, type StatusTone } from "./data-display";
import { Cluster, Stack } from "./layout";
import { Progress } from "./feedback";
import { Textarea } from "./inputs";
import styles from "./components.module.css";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  alignment?: "start" | "center";
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  alignment = "start",
}: PageHeaderProps) {
  return (
    <header
      className={`${styles.pageHeader} ${
        alignment === "center" ? styles.pageHeaderCentered : ""
      }`.trim()}
    >
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

export interface StepperProps {
  steps: Step[];
  currentStep: string;
  variant?: "labeled" | "numbers-only" | "dots";
}

export function Stepper({ steps, currentStep, variant = "labeled" }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  const numbersOnly = variant === "numbers-only";
  const dots = variant === "dots";

  return (
    <ol
      className={`${styles.stepper} ${numbersOnly ? styles.stepperNumbersOnly : ""} ${dots ? styles.stepperDots : ""}`.trim()}
      aria-label="Progress"
    >
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`${styles.step} ${index === currentIndex ? styles.stepCurrent : ""} ${
            index < currentIndex ? styles.stepComplete : ""
          }`.trim()}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          <span className={numbersOnly || dots ? "ds-sr-only" : undefined}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export type StarRating = 1 | 2 | 3 | 4 | 5;

export function StarRatingDisplay({ value }: { value: StarRating | null }) {
  if (value === null) return <span className={styles.starRatingDisplay}>Not rated</span>;
  return (
    <span className={styles.starRatingDisplay} role="img" aria-label={`${value} out of 5 stars`}>
      {([1, 2, 3, 4, 5] as const).map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={star <= value ? styles.starDisplayFilled : undefined}
        />
      ))}
    </span>
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
  variant = "numeric-range",
  onClear,
  describedBy,
}: {
  legend: string;
  name: string;
  value?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  variant?: "numeric-range" | "stars";
  onClear?: () => void;
  describedBy?: string;
}) {
  return (
    <fieldset
      className={`${styles.rating} ${variant === "stars" ? styles.starRating : ""}`.trim()}
      aria-describedby={describedBy}
      disabled={disabled}
    >
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
          <label
            htmlFor={`${name}-${option}`}
            className={
              variant === "stars" && option <= (value ?? 0) ? styles.starFilled : undefined
            }
          >
            {variant === "stars" ? (
              <>
                <Star aria-hidden="true" />
                <span className="ds-sr-only">
                  {option} {option === 1 ? "star" : "stars"}
                </span>
              </>
            ) : (
              option
            )}
          </label>
        </span>
      ))}
      {onClear && value !== undefined ? (
        <Button
          className={styles.ratingClear}
          type="button"
          variant="quiet"
          disabled={disabled}
          onClick={onClear}
        >
          Clear rating
        </Button>
      ) : null}
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

export type EarnTestCardBadgeTone = "info" | "success" | "warning";

export interface EarnTestCardBadge {
  id: string;
  label: ReactNode;
  tone: EarnTestCardBadgeTone;
}

export interface EarnTestCardAction {
  label: ReactNode;
  to: string;
  variant?: "primary" | "secondary";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export interface EarnTestCardReputation {
  avatarUrl?: string | null;
  testBackRatePercent: number;
  satisfactionRatePercent: number;
}

export interface EarnTestCardProps {
  title: ReactNode;
  description: ReactNode;
  /** Collapse overflowing descriptions to two lines with an inline disclosure. */
  expandableDescription?: boolean;
  badges: EarnTestCardBadge[];
  action?: EarnTestCardAction;
  supportingNote?: ReactNode;
  supportingNoteTone?: "accent" | "warning";
  reputation?: EarnTestCardReputation;
  headingLevel?: 2 | 3;
  as?: "article" | "section";
  className?: string;
  style?: CSSProperties;
}

function EarnTestCardDescription({
  description,
  headingId,
}: {
  description: ReactNode;
  headingId: string;
}) {
  const contentId = useId();
  const labelId = useId();
  const previewId = useId();
  const measurementRef = useRef<HTMLSpanElement>(null);
  const fittingRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [expandedDescription, setExpandedDescription] = useState<ReactNode>(null);
  const expanded = overflowing && expandedDescription === description;

  useLayoutEffect(() => {
    const measurement = measurementRef.current;
    const fitting = fittingRef.current;
    if (!measurement || !fitting) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const overflows = measurement.scrollHeight > measurement.clientHeight + 1;
      setOverflowing(overflows);
      if (!overflows) return;

      // Fit the suffix together with the preview so it follows the text directly.
      const characters = Array.from(measurement.textContent ?? "");
      let start = 0;
      let end = characters.length;
      while (start < end) {
        const middle = Math.ceil((start + end) / 2);
        fitting.textContent = `${characters.slice(0, middle).join("").trimEnd()}…\u00a0more`;
        if (fitting.scrollHeight <= fitting.clientHeight + 1) start = middle;
        else end = middle - 1;
      }
      setPreviewText(characters.slice(0, start).join("").trimEnd());
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(measurement);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [description]);

  return (
    <div className={styles.earnTestCardDescription}>
      {/* Keep a clamped copy measurable even while the full description is expanded. */}
      <span
        ref={measurementRef}
        className={`${styles.earnTestCardDescriptionClamp} ${styles.earnTestCardDescriptionMeasure}`}
        aria-hidden="true"
        inert
      >
        {description}
      </span>
      <span
        ref={fittingRef}
        className={`${styles.earnTestCardDescriptionClamp} ${styles.earnTestCardDescriptionMeasure}`}
        aria-hidden="true"
        inert
      />
      <p id={contentId} hidden={overflowing && !expanded}>
        {description}
      </p>
      {overflowing ? (
        <Button
          type="button"
          variant="quiet"
          className={
            expanded ? styles.earnTestCardDescriptionLess : styles.earnTestCardDescriptionToggle
          }
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-labelledby={`${labelId} ${headingId}`}
          aria-describedby={expanded ? undefined : previewId}
          onClick={() => setExpandedDescription(expanded ? null : description)}
        >
          <span id={labelId} className={expanded ? undefined : "ds-sr-only"}>
            {expanded ? "Show less" : "Show full description for"}
          </span>
          {!expanded ? (
            <span id={previewId} className={styles.earnTestCardDescriptionClamp}>
              {previewText}
              <span aria-hidden="true">
                …{"\u00a0"}
                <span className={styles.earnTestCardDescriptionMore}>more</span>
              </span>
            </span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}

export function EarnTestCard({
  title,
  description,
  expandableDescription = false,
  badges,
  action,
  supportingNote,
  supportingNoteTone = "warning",
  reputation,
  headingLevel = 3,
  as = "article",
  className = "",
  style,
}: EarnTestCardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const actionVariantClass =
    action?.variant === "secondary" ? styles.buttonSecondary : styles.buttonPrimary;

  return (
    <Surface
      as={as}
      padding="none"
      className={`${styles.earnTestCard} ${className}`.trim()}
      style={style /* ds-exception: runtime-measurements */}
    >
      <div className={styles.earnTestCardContent}>
        <div className={styles.earnTestCardMain}>
          <div className={styles.earnTestCardBadges}>
            {badges.map((badge) => (
              <span
                className={`${styles.earnTestCardBadgeSurface} ${
                  badge.tone === "success"
                    ? styles.earnTestCardBadgeSuccess
                    : badge.tone === "warning"
                      ? styles.earnTestCardBadgeWarning
                      : styles.earnTestCardBadgeInfo
                }`}
                key={badge.id}
              >
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </span>
            ))}
          </div>
          <div className={styles.earnTestCardHead}>
            <Heading id={headingId}>{title}</Heading>
            {expandableDescription ? (
              <EarnTestCardDescription description={description} headingId={headingId} />
            ) : (
              <p>{description}</p>
            )}
            {supportingNote ? (
              <div
                className={`${styles.earnTestCardSupportingNote} ${
                  supportingNoteTone === "accent" ? styles.earnTestCardSupportingNoteAccent : ""
                }`.trim()}
              >
                {supportingNote}
              </div>
            ) : null}
          </div>
        </div>

        {action ? (
          <div className={styles.earnTestCardActionArea}>
            <Link
              to={action.to}
              className={`${styles.button} ${actionVariantClass}`}
              onClick={action.onClick}
            >
              {action.label}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        ) : null}
      </div>

      {reputation ? (
        <div className={styles.earnTestCardFooter}>
          {reputation.avatarUrl ? (
            <img
              src={reputation.avatarUrl}
              alt=""
              className={styles.earnTestCardAvatar}
              loading="lazy"
            />
          ) : null}
          <div className={styles.earnTestCardFooterText}>
            <span>This user has a {reputation.testBackRatePercent}% Test-back Rate</span>
            <span aria-hidden="true">&bull;</span>
            <span>{reputation.satisfactionRatePercent}% Satisfaction Rate</span>
          </div>
        </div>
      ) : null}
    </Surface>
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
