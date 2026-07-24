import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Menu as MenuIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton } from "./actions";
import { Test4TestBrand } from "./brand";
import { Container } from "./layout";
import { Drawer } from "./overlays";
import styles from "./components.module.css";

export interface NavigationItem {
  label: string;
  to: string;
}

export interface TopNavigationProps {
  items: NavigationItem[];
  actions?: ReactNode;
  homeTo?: string;
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

export function TopNavigation({ items, actions, homeTo = "/" }: TopNavigationProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const links = items.map((item) => (
    <NavLink
      key={item.to}
      className={({ isActive }) =>
        `${styles.navLink} ${isActive ? styles.navLinkCurrent : ""}`.trim()
      }
      to={item.to}
      onClick={() => setDrawerOpen(false)}
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
        <div className={styles.navBar}>
          <Test4TestBrand to={homeTo} />
          <nav className={styles.navLinks} aria-label="Primary">
            {links}
          </nav>
          <div className={styles.navActions}>{actions}</div>
          <div className={styles.mobileNavButton}>
            <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <MenuIcon aria-hidden="true" size={20} />
            </IconButton>
          </div>
        </div>
      </Container>
      <MobileNavigationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        items={items}
        actions={actions}
      />
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
}

export function Menu({
  items,
  label,
  onEscape,
}: {
  items: MenuItem[];
  label: string;
  onEscape?: () => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    const activeIndex = refs.current.findIndex((item) => item === document.activeElement);
    const next =
      event.key === "ArrowDown"
        ? Math.min(items.length - 1, activeIndex + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, activeIndex - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };
  return (
    <ul className={styles.menu} role="menu" aria-label={label} onKeyDown={handleKeyDown}>
      {items.map((item, index) => (
        <li key={item.id} role="none">
          <button
            ref={(node) => {
              refs.current[index] = node;
            }}
            className={styles.menuItem}
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
