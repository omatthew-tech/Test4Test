import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import styles from "./components.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "compact" | "default" | "large";

const variantClasses: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  quiet: styles.buttonQuiet,
  danger: styles.buttonDanger,
};

const sizeClasses: Record<ButtonSize, string> = {
  compact: styles.buttonCompact,
  default: "",
  large: styles.buttonLarge,
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = "primary",
  size = "default",
  fullWidth = false,
  loading = false,
  loadingLabel = "Working",
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${variantClasses[variant]} ${sizeClasses[size]} ${
        fullWidth ? styles.buttonFull : ""
      } ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: "secondary" | "quiet" | "danger";
  size?: ButtonSize;
}

export function IconButton({
  label,
  variant = "secondary",
  size = "default",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`${styles.iconButton} ${styles[`iconButton${variant[0].toUpperCase()}${variant.slice(1)}`]} ${sizeClasses[size]} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  external?: boolean;
}

export function Link({ to, external = false, className = "", children, ...props }: LinkProps) {
  const classes = `${styles.link} ${className}`.trim();
  if (external) {
    return (
      <a className={classes} href={to} {...props}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink className={classes} to={to} {...props}>
      {children}
    </RouterLink>
  );
}
