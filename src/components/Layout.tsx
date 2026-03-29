import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import { getCreditBalance } from "../lib/selectors";

const navItems = [
  { to: "/earn", label: "Earn" },
  { to: "/my-tests", label: "My Tests" },
  { to: "/submit", label: "Submit" },
];

const brandLogoPath = "/branding/Test4Test%20Regular%20Logo.png";

export function AppShell({
  title,
  description,
  actions,
  eyebrowLabel,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrowLabel?: string | null;
  children: React.ReactNode;
}) {
  const { state, currentUser } = useAppState();
  const credits = getCreditBalance(state, currentUser?.id ?? null);
  const [hasBrandLogo, setHasBrandLogo] = useState(false);
  const showMemberNav = Boolean(currentUser);
  const profileHref = currentUser ? "/profile" : "/sign-in";

  useEffect(() => {
    const image = new Image();
    image.onload = () => setHasBrandLogo(true);
    image.onerror = () => setHasBrandLogo(false);
    image.src = brandLogoPath;
  }, []);

  return (
    <div className="app-shell">
      <div className="site-header">
        <header className={`topbar${showMemberNav ? "" : " topbar--guest"}`}>
          <NavLink to="/" className="brandmark" aria-label="Test4Test home">
            {hasBrandLogo ? (
              <img src={brandLogoPath} alt="Test4Test" className="brandmark__image" />
            ) : (
              <span className="brandmark__text">
                <strong>Test4Test</strong>
              </span>
            )}
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

      <main className="page-shell">
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

