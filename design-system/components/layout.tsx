import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import styles from "./components.module.css";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";
const gapClasses: Record<Gap, string> = {
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
};

type ContainerSize = "full" | "prose" | "form" | "data";
const containerClasses: Record<ContainerSize, string> = {
  full: "",
  prose: styles.containerProse,
  form: styles.containerForm,
  data: styles.containerData,
};

export interface LayoutProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
}

export interface ApplicationShellProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  mainId?: string;
  mainClassName?: string;
}

export function ApplicationShell({
  header,
  children,
  footer,
  mainId = "main-content",
  mainClassName = "",
  className = "",
  ...props
}: ApplicationShellProps) {
  return (
    <div className={`${styles.applicationShell} ${className}`.trim()} {...props}>
      {header}
      <main
        className={`${styles.applicationMain} ${mainClassName}`.trim()}
        id={mainId}
        tabIndex={-1}
      >
        {children}
      </main>
      {footer}
    </div>
  );
}

export interface ContainerProps extends LayoutProps {
  size?: ContainerSize;
}

export function Container({ as = "div", size = "full", className = "", ...props }: ContainerProps) {
  return createElement(as, {
    ...props,
    className: `${styles.container} ${containerClasses[size]} ${className}`.trim(),
  });
}

export interface GapLayoutProps extends LayoutProps {
  gap?: Gap;
}

export function Stack({ as = "div", gap = "md", className = "", ...props }: GapLayoutProps) {
  return createElement(as, {
    ...props,
    className: `${styles.stack} ${gapClasses[gap]} ${className}`.trim(),
  });
}

export function Cluster({ as = "div", gap = "sm", className = "", ...props }: GapLayoutProps) {
  return createElement(as, {
    ...props,
    className: `${styles.cluster} ${gapClasses[gap]} ${className}`.trim(),
  });
}

export function Grid({ as = "div", gap = "md", className = "", ...props }: GapLayoutProps) {
  return createElement(as, {
    ...props,
    className: `${styles.grid} ${gapClasses[gap]} ${className}`.trim(),
  });
}

export interface SectionProps extends LayoutProps {
  tone?: "canvas" | "subtle";
}

export function Section({
  as = "section",
  tone = "canvas",
  className = "",
  ...props
}: SectionProps) {
  return createElement(as, {
    ...props,
    className:
      `${styles.section} ${tone === "subtle" ? styles.sectionSubtle : ""} ${className}`.trim(),
  });
}

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  decorative?: boolean;
}

export function Divider({ decorative = false, className = "", ...props }: DividerProps) {
  return (
    <hr
      className={`${styles.divider} ${className}`.trim()}
      aria-hidden={decorative || undefined}
      {...props}
    />
  );
}

export interface BentoGridProps extends LayoutProps {
  wideItemIndexes?: number[];
}

export function BentoGrid({
  as = "div",
  className = "",
  children,
  wideItemIndexes = [],
  ...props
}: BentoGridProps) {
  const childArray = Array.isArray(children) ? children : [children];
  return createElement(
    as,
    { ...props, className: `${styles.bentoGrid} ${className}`.trim() },
    childArray.map((child, index) => (
      <div className={wideItemIndexes.includes(index) ? styles.bentoWide : undefined} key={index}>
        {child}
      </div>
    )),
  );
}
