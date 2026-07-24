import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { IconButton } from "./actions";
import styles from "./components.module.css";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !ref.current) return undefined;

    previousFocus.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const firstFocusable = ref.current?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? ref.current)?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent<T>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = [...(ref.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    if (focusable.length === 0) {
      event.preventDefault();
      ref.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === ref.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { ref, onKeyDown, tabIndex: -1 as const };
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  variant?: "dialog" | "drawer";
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className = "",
  variant = "dialog",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    requestAnimationFrame(() => previousFocus.current?.focus());
  };

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${variant === "drawer" ? styles.drawer : ""} ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          handleClose();
        }
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <div className={styles.stack}>
            <h2 className={styles.dialogTitle} id={titleId}>
              {title}
            </h2>
            {description && (
              <p className={styles.dialogDescription} id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" onClick={handleClose}>
            <X aria-hidden="true" size={20} />
          </IconButton>
        </div>
        <div>{children}</div>
        {footer && <div>{footer}</div>}
      </div>
    </dialog>
  );
}

export function Drawer(props: Omit<DialogProps, "variant">) {
  return <Dialog {...props} variant="drawer" />;
}

export interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  defaultOpen?: boolean;
}

export function Popover({ trigger, children, label, defaultOpen = false }: PopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.popover}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          (event.currentTarget.querySelector("[aria-expanded]") as HTMLElement | null)?.focus();
        }
      }}
    >
      {cloneElement(trigger, {
        "aria-expanded": open,
        "aria-controls": id,
        "aria-haspopup": "dialog",
        onClick: () => setOpen((value) => !value),
      } as HTMLAttributes<HTMLElement>)}
      {open && (
        <div className={styles.popoverPanel} id={id} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  defaultOpen?: boolean;
}

export function Tooltip({ content, children, defaultOpen = false }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  if (!isValidElement(children)) return children;
  return (
    <span
      className={styles.tooltipWrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      {cloneElement(children, { "aria-describedby": id } as HTMLAttributes<HTMLElement>)}
      {open && (
        <span className={`${styles.tooltip} ${styles.tooltipVisible}`} id={id} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
