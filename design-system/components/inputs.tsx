import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle } from "lucide-react";
import styles from "./components.module.css";

interface FieldChromeProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  helpText?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

export interface HelpTextProps {
  id?: string;
  children: ReactNode;
}

export function HelpText({ id, children }: HelpTextProps) {
  return (
    <span className={styles.help} id={id}>
      {children}
    </span>
  );
}

function FieldChrome({ id, label, required, helpText, error, children }: FieldChromeProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {helpText && !error && <HelpText id={`${id}-help`}>{helpText}</HelpText>}
      {error && (
        <span className={styles.error} id={`${id}-error`}>
          <AlertCircle aria-hidden="true" size={16} />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  helpText?: ReactNode;
  error?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id: suppliedId, label, helpText, error, required, className = "", ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy = error ? `${id}-error` : helpText ? `${id}-help` : undefined;
  return (
    <FieldChrome id={id} label={label} required={required} helpText={helpText} error={error}>
      <input
        ref={ref}
        id={id}
        className={`${styles.input} ${error ? styles.inputError : ""} ${className}`.trim()}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldChrome>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  helpText?: ReactNode;
  error?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id: suppliedId, label, helpText, error, required, className = "", ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy = error ? `${id}-error` : helpText ? `${id}-help` : undefined;
  return (
    <FieldChrome id={id} label={label} required={required} helpText={helpText} error={error}>
      <textarea
        ref={ref}
        id={id}
        className={`${styles.textarea} ${error ? styles.textareaError : ""} ${className}`.trim()}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldChrome>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  helpText?: ReactNode;
  error?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id: suppliedId, label, helpText, error, required, className = "", children, ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy = error ? `${id}-error` : helpText ? `${id}-help` : undefined;
  return (
    <FieldChrome id={id} label={label} required={required} helpText={helpText} error={error}>
      <select
        ref={ref}
        id={id}
        className={`${styles.select} ${error ? styles.selectError : ""} ${className}`.trim()}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </select>
    </FieldChrome>
  );
});

export interface ComboboxProps extends Omit<TextFieldProps, "list"> {
  options: Array<{ value: string; label: string }>;
}

export function Combobox({ options, id: suppliedId, ...props }: ComboboxProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <>
      <TextField id={id} list={`${id}-options`} {...props} />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

export interface ChoiceProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(
  { id: suppliedId, label, description, className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={`${styles.choice} ${className}`.trim()}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-describedby={[describedBy, descriptionId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      <span>
        <label htmlFor={id}>{label}</label>
        {description && <HelpText id={descriptionId}>{description}</HelpText>}
      </span>
    </div>
  );
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(
  { id: suppliedId, label, description, className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={`${styles.choice} ${className}`.trim()}>
      <input
        ref={ref}
        id={id}
        type="radio"
        aria-describedby={[describedBy, descriptionId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      <span>
        <label htmlFor={id}>{label}</label>
        {description && <HelpText id={descriptionId}>{description}</HelpText>}
      </span>
    </div>
  );
});

export const Switch = forwardRef<HTMLInputElement, ChoiceProps>(function Switch(
  { id: suppliedId, label, description, className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={`${styles.switch} ${className}`.trim()}>
      <input
        ref={ref}
        id={id}
        className={styles.switchInput}
        type="checkbox"
        role="switch"
        aria-describedby={[describedBy, descriptionId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      <span className={styles.switchTrack} aria-hidden="true" />
      <span>
        <label htmlFor={id}>{label}</label>
        {description && <HelpText id={descriptionId}>{description}</HelpText>}
      </span>
    </div>
  );
});
