import type { CSSProperties, ReactNode } from "react";
import { useId, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import { getMySubmissions } from "../lib/selectors";

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

const supportEmail = "support@test4test.io";

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner site-footer__columns">
        <div className="site-footer__brand">
          <NavLink to="/" className="brandmark site-footer__brandmark" aria-label="Test4Test home">
            <img
              src={brandLogoPath}
              alt=""
              className="brandmark__image"
              loading="lazy"
              decoding="async"
            />
            <span className="brandmark__wordmark">Test4Test</span>
          </NavLink>
          <p className="site-footer__copyright">
            &copy; {new Date().getFullYear()} Test4Test. All rights reserved.
          </p>
        </div>

        <nav className="site-footer__column" aria-label="Product">
          <h3 className="site-footer__heading">Product</h3>
          <ul className="site-footer__list">
            <li>
              <NavLink to="/submit" className="site-footer__link">
                Get your app tested
              </NavLink>
            </li>
            <li>
              <NavLink to="/get-paid-to-test" className="site-footer__link">
                Get paid to test
              </NavLink>
            </li>
            <li>
              <Link to="/blog" className="site-footer__link">
                Blog
              </Link>
            </li>
            <li>
              <NavLink to="/sign-in" className="site-footer__link">
                Sign in
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="site-footer__column">
          <h3 className="site-footer__heading">Support</h3>
          <ul className="site-footer__list">
            <li>
              <a href={`mailto:${supportEmail}`} className="site-footer__link">
                {supportEmail}
              </a>
            </li>
          </ul>
        </div>
      </div>
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
  children: ReactNode;
}) {
  const mobileMenuId = useId();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { currentUser, state } = useAppState();
  const myFeedbackSubmission = getMySubmissions(state)[0] ?? null;
  const myFeedbackHref = myFeedbackSubmission ? `/my-tests/${myFeedbackSubmission.id}` : "/my-tests";
  const navItems = [
    { to: "/earn", label: "Earn", mobileLabel: "Earn" },
    {
      to: myFeedbackHref,
      label: "My Feedback",
      mobileLabel: "My Feedback",
      activePathPrefix: "/my-tests",
    },
    { to: "/submit", label: "New App", mobileLabel: "New App" },
    { to: "/submissions", label: "My Reviews", mobileLabel: "My Reviews" },
    { to: "/ai-analysis", label: "AI Analysis", mobileLabel: "AI Analysis", activePathPrefix: "/ai-analysis" },
  ];
  const showMemberNav = Boolean(currentUser) && !hideMemberChrome;
  const showTopbarActions = !hideMemberChrome;
  const profileHref = currentUser ? "/profile" : "/sign-in";
  const hasMarketingHeader = headerVariant === "marketing";
  const showGuestMarketingMenu = hasMarketingHeader && !showMemberNav && showTopbarActions;
  const shouldShowAudienceToggle = showAudienceToggle && hasMarketingHeader && !showMemberNav;
  const shellClassName = `app-shell${variant === "marketing" ? " app-shell--marketing" : ""}`;
  const siteHeaderClassName = `site-header${hasMarketingHeader ? " site-header--marketing" : ""}`;
  const topbarClassName = `topbar${showMemberNav ? " topbar--member" : " topbar--guest"}${hasMarketingHeader ? " topbar--marketing" : ""}`;
  const pageShellClassName = `page-shell${variant === "marketing" ? " page-shell--marketing" : ""}`;

  return (
    <div className={shellClassName}>
      {hideSiteHeader ? null : (
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
              <nav
                id={mobileMenuId}
                className={`topnav${isMobileMenuOpen ? " topnav--open" : ""}`}
                aria-label="Primary navigation"
              >
                {navItems.map(({ to, label, mobileLabel, activePathPrefix }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => {
                      const isPrefixActive = activePathPrefix
                        ? location.pathname === activePathPrefix ||
                          location.pathname.startsWith(`${activePathPrefix}/`)
                        : false;

                      return `topnav__link${isActive || isPrefixActive ? " topnav__link--active" : ""}`;
                    }}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span className="topnav__label topnav__label--desktop">{label}</span>
                    <span className="topnav__label topnav__label--mobile">{mobileLabel}</span>
                  </NavLink>
                ))}
                <NavLink
                  to={profileHref}
                  className={({ isActive }) =>
                    `topnav__link topnav__profile-link${isActive ? " topnav__link--active" : ""}`
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="topnav__label topnav__label--desktop">Profile</span>
                  <span className="topnav__label topnav__label--mobile">Profile</span>
                </NavLink>
              </nav>
            ) : null}

            {showGuestMarketingMenu ? (
              <nav
                id={mobileMenuId}
                className={`guest-mobile-menu${isMobileMenuOpen ? " guest-mobile-menu--open" : ""}`}
                aria-label="Mobile navigation"
              >
                <Link
                  to="/blog"
                  className="guest-mobile-menu__item"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Blog
                  <span className="guest-mobile-menu__item-arrow" aria-hidden="true" />
                </Link>
                <Link
                  to="/get-paid-to-test"
                  className="guest-mobile-menu__item guest-mobile-menu__item--tester"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Want to get paid to test?
                  <span className="guest-mobile-menu__item-arrow" aria-hidden="true" />
                </Link>
                <div className="guest-mobile-menu__actions">
                  <NavLink
                    to="/sign-in"
                    className="guest-mobile-menu__button guest-mobile-menu__button--login"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Log in
                  </NavLink>
                  <Link
                    to="/submit"
                    className="guest-mobile-menu__button guest-mobile-menu__button--start"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Get started -&gt;
                  </Link>
                </div>
              </nav>
            ) : null}

            {showTopbarActions ? (
              <div className="topbar__actions">
                {hasMarketingHeader && !showMemberNav ? (
                  <Link to="/blog" className="topbar-blog-link">
                    Blog
                  </Link>
                ) : null}
                <NavLink to={profileHref} className="button button--secondary button--small topbar-profile-link">
                  {currentUser ? "Profile" : "Log in"}
                </NavLink>
                {showMemberNav ? (
                  <button
                    type="button"
                    className="mobile-menu-button"
                    aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls={mobileMenuId}
                    onClick={() => setIsMobileMenuOpen((current) => !current)}
                  >
                    {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                  </button>
                ) : null}
                {showGuestMarketingMenu ? (
                  <button
                    type="button"
                    className="mobile-menu-button guest-mobile-menu-toggle"
                    aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls={mobileMenuId}
                    onClick={() => setIsMobileMenuOpen((current) => !current)}
                  >
                    {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>
        </div>
      )}

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

      {variant === "marketing" ? <SiteFooter /> : null}
    </div>
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
  return <section className={`surface ${className}`.trim()} style={style}>{children}</section>;
}

