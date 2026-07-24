import type { CSSProperties, ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ApplicationShell as DesignSystemApplicationShell,
  Button,
  Cluster,
  Container,
  PageHeader,
  Stack,
  Surface as DesignSystemSurface,
  Test4TestBrand,
  TopNavigation,
} from "@test4test/design-system";
import { useAppState } from "../context/AppStateContext";
import { getMySubmissions } from "../lib/selectors";
import styles from "./Layout.module.css";

const audienceRoleOptions = ["Founder", "Tester"] as const;
export type AudienceRole = (typeof audienceRoleOptions)[number];
const supportEmail = "support@test4test.io";

function HeaderAudienceToggle({
  audienceRole,
  onAudienceRoleChange,
}: {
  audienceRole: AudienceRole;
  onAudienceRoleChange?: (role: AudienceRole) => void;
}) {
  const audiencePrompt =
    audienceRole === "Tester" ? "Want free user testing?" : "Want to get paid to test?";

  return (
    <div className={styles.audience} aria-label="Testing audience selector">
      <span className={styles.audiencePrompt}>{audiencePrompt}</span>
      <Cluster gap="xs" role="group" aria-label="Choose your role">
        {audienceRoleOptions.map((role) => (
          <Button
            key={role}
            type="button"
            size="compact"
            variant={audienceRole === role ? "primary" : "secondary"}
            aria-pressed={audienceRole === role}
            onClick={() => onAudienceRoleChange?.(role)}
          >
            {role}
          </Button>
        ))}
      </Cluster>
    </div>
  );
}

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
  headerVariant = variant,
  hideMemberChrome = false,
  hideSiteHeader = false,
  showAudienceToggle = false,
  audienceRole = "Founder",
  onAudienceRoleChange,
  contentWidth = "container",
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrowLabel?: string | null;
  variant?: "default" | "marketing";
  headerVariant?: "default" | "marketing";
  hideMemberChrome?: boolean;
  hideSiteHeader?: boolean;
  showAudienceToggle?: boolean;
  audienceRole?: AudienceRole;
  onAudienceRoleChange?: (role: AudienceRole) => void;
  contentWidth?: "container" | "viewport";
  children: ReactNode;
}) {
  const location = useLocation();
  const { currentUser, state } = useAppState();
  const myFeedbackSubmission = getMySubmissions(state)[0] ?? null;
  const myFeedbackHref = myFeedbackSubmission
    ? `/my-tests/${myFeedbackSubmission.id}`
    : "/my-tests";
  const showMemberNav = Boolean(currentUser) && !hideMemberChrome;
  const hasMarketingHeader = headerVariant === "marketing";
  const profileHref = currentUser ? "/profile" : "/sign-in";

  const memberItems = [
    { to: "/earn", label: "Earn" },
    { to: myFeedbackHref, label: "My feedback" },
    { to: "/submit", label: "New app" },
    { to: "/submissions", label: "My reviews" },
  ];
  const guestItems = [
    { to: "/blog", label: "Blog" },
    { to: "/get-paid-to-test", label: "Get paid to test" },
  ];

  const navigationActions = !hideMemberChrome ? (
    <Cluster gap="sm">
      {showAudienceToggle && hasMarketingHeader && !showMemberNav ? (
        <HeaderAudienceToggle
          audienceRole={audienceRole}
          onAudienceRoleChange={onAudienceRoleChange}
        />
      ) : null}
      <NavLink
        to={profileHref}
        className={({ isActive }) =>
          `${styles.profileLink} ${isActive ? styles.profileLinkActive : ""}`.trim()
        }
      >
        {currentUser ? "Profile" : "Log in"}
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
          <TopNavigation
            items={showMemberNav ? memberItems : guestItems}
            actions={navigationActions}
          />
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
