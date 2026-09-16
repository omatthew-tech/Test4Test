import {
  cloneElement,
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronRight, Menu as MenuIcon, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { tokens } from "../tokens/generated/tokens";
import { Button, IconButton } from "./actions";
import { Test4TestBrand } from "./brand";
import { Container, Divider } from "./layout";
import { Drawer } from "./overlays";
import styles from "./components.module.css";

export interface NavigationItem {
  label: string;
  to: string;
  icon?: ReactNode;
}

export type MobileAccountItem = { id: string; label: string; icon?: ReactNode } & (
  | { to: string; onSelect?: never; disabled?: never }
  | { to?: never; onSelect: () => void; disabled?: boolean }
);

export interface TopNavigationProps {
  items: NavigationItem[];
  actions?: ReactNode;
  homeTo?: string;
  mobileActions?: (closeNavigation: () => void) => ReactNode;
  mobileAccountItems?: MobileAccountItem[];
}

export interface MobileNavigationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavigationItem[];
  actions?: ReactNode;
  title?: string;
}

export function MobileNavigationDrawer({
  open,
  onOpenChange,
  items,
  actions,
  title = "Navigation",
}: MobileNavigationDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title}>
      <nav className={styles.mobilePanel} aria-label="Primary">
        {items.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkCurrent : ""}`.trim()
            }
            to={item.to}
            onClick={() => onOpenChange(false)}
          >
            {item.label}
          </NavLink>
        ))}
        {actions}
      </nav>
    </Drawer>
  );
}

export function TopNavigation({
  items,
  actions,
  homeTo = "/",
  mobileActions,
  mobileAccountItems = [],
}: TopNavigationProps) {
  const location = useLocation();
  const [openLocation, setOpenLocation] = useState<typeof location | null>(null);
  const open = openLocation === location;
  const navigationId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeNavigation = () => setOpenLocation(null);
  const focusTrigger = () => triggerRef.current?.querySelector("button")?.focus();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent | FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenLocation(null);
    };
    const desktop = window.matchMedia(`(min-width: ${tokens["primitive.breakpoint.large"].value})`);
    const dismissOnDesktop = () => {
      if (!desktop.matches) return;
      if (panelRef.current?.contains(document.activeElement)) {
        rootRef.current?.querySelector<HTMLElement>(`.${styles.navLinks} a`)?.focus();
      }
      setOpenLocation(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [open]);

  const mobileLabel = (label: string, icon?: ReactNode, chevron = true) => (
    <>
      {icon && (
        <span className={styles.mobileNavigationIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.mobileNavigationLabel}>{label}</span>
      {chevron && <ChevronRight className={styles.mobileNavigationChevron} aria-hidden="true" />}
    </>
  );
  const links = items.map((item) => (
    <NavLink
      key={item.to}
      className={({ isActive }) =>
        `${styles.navLink} ${isActive ? styles.navLinkCurrent : ""}`.trim()
      }
      to={item.to}
      onClick={closeNavigation}
    >
      {item.label}
    </NavLink>
  ));

  return (
    <header className={styles.header}>
      <a className="ds-skip-link" href="#main-content">
        Skip to content
      </a>
      <Container>
        <div
          ref={rootRef}
          className={styles.navBar}
          onKeyDown={(event) => {
            if (open && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeNavigation();
              focusTrigger();
            }
          }}
        >
          <Test4TestBrand to={homeTo} />
          <nav className={styles.navLinks} aria-label="Primary">
            {links}
          </nav>
          <div className={styles.navActions}>{actions}</div>
          <div ref={triggerRef} className={styles.mobileNavButton}>
            <IconButton
              label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls={navigationId}
              onClick={() => setOpenLocation(open ? null : location)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                setOpenLocation(location);
                requestAnimationFrame(() =>
                  panelRef.current?.querySelector<HTMLElement>("a, button")?.focus(),
                );
              }}
            >
              {open ? (
                <X aria-hidden="true" size={20} />
              ) : (
                <MenuIcon aria-hidden="true" size={20} />
              )}
            </IconButton>
          </div>
          {open && (
            <div ref={panelRef} id={navigationId} className={styles.mobileNavigationDropdown}>
              <nav className={styles.mobileNavigationGroup} aria-label="Primary">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${styles.mobileNavigationLink} ${isActive ? styles.navLinkCurrent : ""}`.trim()
                    }
                    onClick={closeNavigation}
                  >
                    {mobileLabel(item.label, item.icon)}
                  </NavLink>
                ))}
              </nav>
              {mobileAccountItems.length > 0 ? (
                <nav className={styles.mobileNavigationAccount} aria-label="Account">
                  {mobileAccountItems.map((item) =>
                    item.to !== undefined ? (
                      <NavLink
                        key={item.id}
                        to={item.to}
                        className={({ isActive }) =>
                          `${styles.mobileNavigationLink} ${isActive ? styles.navLinkCurrent : ""}`.trim()
                        }
                        onClick={closeNavigation}
                      >
                        {mobileLabel(item.label, item.icon)}
                      </NavLink>
                    ) : (
                      <Button
                        key={item.id}
                        variant="quiet"
                        className={styles.mobileNavigationLink}
                        disabled={item.disabled}
                        onClick={() => {
                          closeNavigation();
                          item.onSelect();
                        }}
                      >
                        {mobileLabel(item.label, item.icon, false)}
                      </Button>
                    ),
                  )}
                </nav>
              ) : (
                (actions || mobileActions) && (
                  <div
                    className={styles.mobileNavigationActions}
                    onClick={(event) => {
                      if ((event.target as Element).closest("a[href]")) closeNavigation();
                    }}
                  >
                    {mobileActions ? mobileActions(closeNavigation) : actions}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </Container>
    </header>
  );
}

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  initialId?: string;
  value?: string;
  onValueChange?: (id: string) => void;
}

export function Tabs({ items, initialId, value, onValueChange }: TabsProps) {
  const [uncontrolledId, setUncontrolledId] = useState(initialId ?? items[0]?.id);
  const activeId = value ?? uncontrolledId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const selectTab = (id: string) => {
    if (value === undefined) setUncontrolledId(id);
    onValueChange?.(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    selectTab(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            className={`${styles.tab} ${activeId === item.id ? styles.tabSelected : ""}`.trim()}
            id={`${item.id}-tab`}
            role="tab"
            aria-selected={activeId === item.id}
            aria-controls={`${item.id}-panel`}
            tabIndex={activeId === item.id ? 0 : -1}
            onClick={() => selectTab(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          id={`${item.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${item.id}-tab`}
          hidden={index !== activeIndex}
          tabIndex={0}
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}

export function Breadcrumb({ items }: { items: NavigationItem[] }) {
  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <ol className={styles.breadcrumbList}>
        {items.map((item, index) => (
          <li className={styles.breadcrumbItem} key={item.to}>
            {index > 0 && <ChevronRight aria-hidden="true" size={16} />}
            {index === items.length - 1 ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <NavLink to={item.to}>{item.label}</NavLink>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  return (
    <nav aria-label="Pagination">
      <ol className={styles.pagination}>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <li key={number}>
            <button
              className={`${styles.pageButton} ${number === page ? styles.pageCurrent : ""}`.trim()}
              aria-label={`Page ${number}`}
              aria-current={number === page ? "page" : undefined}
              onClick={() => onPageChange(number)}
            >
              {number}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  label: string;
  onEscape?: () => void;
  trigger?: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  align?: "start" | "end";
}

export function Menu({ items, label, onEscape, trigger, align = "end" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(() => items.findIndex((item) => !item.disabled));
  const initialFocus = useRef<"first" | "last">("first");
  const tabbing = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const enabled = refs.current.filter((item) => item && !item.disabled);
    const first = initialFocus.current === "last" ? enabled[enabled.length - 1] : enabled[0];
    first?.focus();

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (trigger && event.key === "Tab") {
      tabbing.current = true;
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (trigger) closeMenu(true);
      onEscape?.();
      return;
    }
    const enabled = refs.current.filter((item) => item && !item.disabled);
    const activeIndex = enabled.findIndex((item) => item === document.activeElement);
    const next =
      event.key === "ArrowDown"
        ? Math.min(enabled.length - 1, activeIndex + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, activeIndex - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabled.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    enabled[next]?.focus();
  };
  const menu = (
    <ul
      className={`${styles.menu} ${trigger ? styles.menuDropdown : ""}`.trim()}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {item.separatorBefore && index > 0 && (
            <li role="none" className={styles.menuSeparator}>
              <Divider className={styles.menuDivider} />
            </li>
          )}
          <li role="none">
            <button
              ref={(node) => {
                refs.current[index] = node;
              }}
              className={styles.menuItem}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              tabIndex={trigger ? (focusedIndex === index ? 0 : -1) : undefined}
              onFocus={() => setFocusedIndex(index)}
              onClick={() => {
                if (trigger) closeMenu(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          </li>
        </Fragment>
      ))}
    </ul>
  );

  if (!trigger) return menu;

  return (
    <div
      ref={rootRef}
      className={`${styles.menuAnchor} ${align === "start" ? styles.menuAlignStart : ""}`.trim()}
      onBlur={(event) => {
        if (tabbing.current || !event.currentTarget.contains(event.relatedTarget)) closeMenu();
        tabbing.current = false;
      }}
    >
      {cloneElement(trigger, {
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
        onClick: (event) => {
          trigger.props.onClick?.(event);
          if (event.defaultPrevented) return;
          initialFocus.current = "first";
          setOpen((value) => !value);
        },
        onKeyDown: (event) => {
          trigger.props.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu(true);
            onEscape?.();
          }
        },
      })}
      {open && menu}
    </div>
  );
}
