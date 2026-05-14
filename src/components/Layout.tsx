import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import { getCreditBalance } from "../lib/selectors";

const navItems = [
  { to: "/earn", label: "Earn" },
  { to: "/my-tests", label: "My Apps" },
  { to: "/submit", label: "New App" },
  { to: "/submissions", label: "My Feedback" },
];

const brandLogoPath = "/branding/Test4Test%20Regular%20Logo.png";
const audienceRoleOptions = ["Founder", "Tester"] as const;

export type AudienceRole = (typeof audienceRoleOptions)[number];

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
    <div className="topbar-audience" aria-label="Testing audience selector">
      <span className="topbar-audience__prompt">{audiencePrompt}</span>
      <div className="audience-toggle" role="group" aria-label="Choose your role">
        {audienceRoleOptions.map((role) => (
          <button
            key={role}
            type="button"
            className={`audience-toggle__option${
              audienceRole === role ? " audience-toggle__option--active" : ""
            }`}
            aria-pressed={audienceRole === role}
            onClick={() => onAudienceRoleChange?.(role)}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
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
  showAudienceToggle = false,
  audienceRole = "Founder",
  onAudienceRoleChange,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrowLabel?: string | null;
  variant?: "default" | "marketing";
  headerVariant?: "default" | "marketing";
  hideMemberChrome?: boolean;
  showAudienceToggle?: boolean;
  audienceRole?: AudienceRole;
  onAudienceRoleChange?: (role: AudienceRole) => void;
  children: ReactNode;
}) {
  const { state, currentUser } = useAppState();
  const credits = getCreditBalance(state, currentUser?.id ?? null);
  const showMemberNav = Boolean(currentUser) && !hideMemberChrome;
  const showTopbarActions = !hideMemberChrome;
  const profileHref = currentUser ? "/profile" : "/sign-in";
  const hasMarketingHeader = headerVariant === "marketing";
  const shouldShowAudienceToggle = showAudienceToggle && hasMarketingHeader && !showMemberNav;
  const shellClassName = `app-shell${variant === "marketing" ? " app-shell--marketing" : ""}`;
  const siteHeaderClassName = `site-header${hasMarketingHeader ? " site-header--marketing" : ""}`;
  const topbarClassName = `topbar${showMemberNav ? "" : " topbar--guest"}${hasMarketingHeader ? " topbar--marketing" : ""}`;
  const pageShellClassName = `page-shell${variant === "marketing" ? " page-shell--marketing" : ""}`;

  return (
    <div className={shellClassName}>
      <div className={siteHeaderClassName}>
        <header className={topbarClassName}>
          <NavLink to="/" className="brandmark" aria-label="Test4Test home">
            <img
              src={brandLogoPath}
              alt=""
              className="brandmark__image"
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
            <span className="brandmark__wordmark">Test4Test</span>
          </NavLink>

          {shouldShowAudienceToggle ? (
            <HeaderAudienceToggle
              audienceRole={audienceRole}
              onAudienceRoleChange={onAudienceRoleChange}
            />
          ) : null}

          {showMemberNav ? (
            <nav className="topnav">
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `topnav__link${isActive ? " topnav__link--active" : ""}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          ) : null}

          {showTopbarActions ? (
            <div className="topbar__actions">
              {showMemberNav ? (
                <div className="credit-chip">
                  <strong>{credits}</strong>
                  <span className="credit-chip__label">credits</span>
                </div>
              ) : null}
              <NavLink to={profileHref} className="button button--secondary button--small">
                {currentUser ? "Profile" : "Log in"}
              </NavLink>
            </div>
          ) : null}
        </header>
      </div>

      <main className={pageShellClassName}>
        {title || description || actions ? (
          <section className="page-header">
            <div>
              {title && eyebrowLabel ? <span className="eyebrow">{eyebrowLabel}</span> : null}
              {title ? <h1>{title}</h1> : null}
              {description ? <p>{description}</p> : null}
            </div>
            {actions ? <div className="page-header__actions">{actions}</div> : null}
          </section>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function Surface({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={`surface ${className}`.trim()}>{children}</section>;
}

