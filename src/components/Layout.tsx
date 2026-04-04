import { NavLink } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import { getCreditBalance } from "../lib/selectors";

const navItems = [
  { to: "/earn", label: "Earn" },
  { to: "/my-tests", label: "My Apps" },
  { to: "/submit", label: "Submit" },
  { to: "/submissions", label: "Submissions" },
];

const brandLogoPath = "/branding/Test4Test%20Regular%20Logo.png";

export function AppShell({
  title,
  description,
  actions,
  eyebrowLabel,
  variant = "default",
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrowLabel?: string | null;
  variant?: "default" | "marketing";
  children: React.ReactNode;
}) {
  const { state, currentUser } = useAppState();
  const credits = getCreditBalance(state, currentUser?.id ?? null);
  const showMemberNav = Boolean(currentUser);
  const profileHref = currentUser ? "/profile" : "/sign-in";
  const shellClassName = `app-shell${variant === "marketing" ? " app-shell--marketing" : ""}`;
  const siteHeaderClassName = `site-header${variant === "marketing" ? " site-header--marketing" : ""}`;
  const topbarClassName = `topbar${showMemberNav ? "" : " topbar--guest"}${variant === "marketing" ? " topbar--marketing" : ""}`;
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
  children: React.ReactNode;
}) {
  return <section className={`surface ${className}`.trim()}>{children}</section>;
}
