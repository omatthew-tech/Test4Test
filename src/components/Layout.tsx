import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ApplicationShell as DesignSystemApplicationShell,
  Cluster,
  Container,
  PageHeader,
  Stack,
  Surface as DesignSystemSurface,
  Test4TestBrand,
  TopNavigation,
} from "@test4test/design-system";
import { useAppState } from "../context/AppStateContext";
import styles from "./Layout.module.css";

const supportEmail = "support@test4test.io";

function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.footerGrid}>
          <Stack gap="sm">
            <Test4TestBrand />
            <p className={styles.copyright}>
              &copy; {new Date().getFullYear()} Test4Test. All rights reserved.
            </p>
          </Stack>
          <nav aria-label="Product">
            <h2 className={styles.footerHeading}>Product</h2>
            <ul className={styles.footerList}>
              <li>
                <NavLink to="/submit">Get your app tested</NavLink>
              </li>
              <li>
                <NavLink to="/get-paid-to-test">Get paid to test</NavLink>
              </li>
              <li>
                <NavLink to="/blog">Blog</NavLink>
              </li>
              <li>
                <NavLink to="/sign-in">Sign in</NavLink>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className={styles.footerHeading}>Support</h2>
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export function AppShell({
  title,
  description,
  actions,
  eyebrowLabel,
  variant = "default",
  hideMemberChrome = false,
  hideSiteHeader = false,
  contentWidth = "container",
  headerAlignment = "start",
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrowLabel?: string | null;
  variant?: "default" | "marketing";
  hideMemberChrome?: boolean;
  hideSiteHeader?: boolean;
  contentWidth?: "container" | "viewport";
  headerAlignment?: "start" | "center";
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAppState();
  const showMemberNav = Boolean(currentUser) && !hideMemberChrome;
  const profileHref = currentUser ? "/profile" : "/sign-in";

  const memberItems =
    currentUser?.accountType === "tester"
      ? [{ to: "/earn", label: "Earn" }]
      : [
          { to: "/earn", label: "Earn" },
          { to: "/share", label: "Share" },
          { to: "/analytics", label: "Analytics" },
          { to: "/submit", label: "New app" },
          { to: "/submissions", label: "My reviews" },
        ];
  const guestItems = [
    { to: "/blog", label: "Blog" },
    { to: "/get-paid-to-test", label: "Get paid to test" },
  ];
  const handleSelectedTesterLandingClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (location.pathname !== "/get-paid-to-test" || !(event.target instanceof Element)) return;

    const testerLandingLink = event.target.closest('a[href="/get-paid-to-test"]');
    if (!testerLandingLink) return;

    event.preventDefault();
    navigate("/");
  };

  const navigationActions = !hideMemberChrome ? (
    <Cluster gap="sm">
      <NavLink
        to={profileHref}
        className={({ isActive }) =>
          `${styles.profileLink} ${currentUser && isActive ? styles.profileLinkActive : ""}`.trim()
        }
      >
        {currentUser ? "Profile" : "Sign in"}
      </NavLink>
      {!currentUser && (
        <NavLink className={styles.startLink} to="/submit">
          Get started
        </NavLink>
      )}
    </Cluster>
  ) : null;

  const content = (
    <Stack gap="xl">
      {title || description || actions ? (
        <PageHeader
          title={title}
          description={description}
          actions={actions}
          alignment={headerAlignment}
          eyebrow={
            title && eyebrowLabel ? (
              <span className={styles.eyebrow}>{eyebrowLabel}</span>
            ) : undefined
          }
        />
      ) : null}
      {children}
    </Stack>
  );

  return (
    <DesignSystemApplicationShell
      className={`${styles.shell} ${variant === "marketing" ? styles.marketing : ""}`.trim()}
      data-route={location.pathname}
      header={
        !hideSiteHeader ? (
          <div onClickCapture={handleSelectedTesterLandingClick}>
            <TopNavigation
              items={showMemberNav ? memberItems : guestItems}
              actions={navigationActions}
            />
          </div>
        ) : undefined
      }
      mainClassName={styles.main}
      footer={variant === "marketing" ? <SiteFooter /> : undefined}
    >
      {contentWidth === "viewport" ? content : <Container>{content}</Container>}
    </DesignSystemApplicationShell>
  );
}

export function Surface({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // ds-exception: runtime-measurements — forwards the Earn-row placement geometry only.
  return (
    <DesignSystemSurface as="section" className={className} style={style}>
      {children}
    </DesignSystemSurface>
  );
}
