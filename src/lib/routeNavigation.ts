import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Restore history entries after the destination shell has finished loading. */
export function useRouteNavigation() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, { left: number; top: number }>());
  const previousPath = useRef<string | null>(null);

  useLayoutEffect(() => {
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = original;
    };
  }, []);

  useLayoutEffect(() => {
    const changedPage = previousPath.current !== null && previousPath.current !== location.pathname;
    const initialVisit = previousPath.current === null;
    previousPath.current = location.pathname;
    let ready = false;
    let frame = 0;
    const savedPosition = positions.current.get(location.key);
    const currentPosition = { left: window.scrollX, top: window.scrollY };
    const rememberPosition = () => {
      if (ready) {
        positions.current.set(location.key, { left: window.scrollX, top: window.scrollY });
      }
    };
    const restore = () => {
      const shell = [...document.querySelectorAll<HTMLElement>("[data-route]")].find(
        (element) =>
          element.dataset.route === location.pathname && element.getClientRects().length > 0,
      );
      const main = shell?.querySelector<HTMLElement>("main");
      if (!main) return;

      let anchor: HTMLElement | null = null;
      if (location.hash) {
        try {
          anchor = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        } catch {
          // An invalid fragment must not prevent ordinary page navigation.
        }
      }

      if (navigationType === "POP" && savedPosition) {
        window.scrollTo({ ...savedPosition, behavior: "instant" });
      } else if (anchor) {
        anchor.scrollIntoView({ behavior: "instant" });
      } else if (!initialVisit) {
        window.scrollTo({
          ...(changedPage ? { left: 0, top: 0 } : currentPosition),
          behavior: "instant",
        });
      }

      ready = true;
      rememberPosition();
      observer.disconnect();
      const fieldHasFocus =
        main.contains(document.activeElement) &&
        document.activeElement?.matches("input, textarea, select");
      if (changedPage && !fieldHasFocus && !document.querySelector("dialog[open]")) {
        const target = anchor ?? main.querySelector<HTMLElement>("h1") ?? main;
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "data-route"],
    });
    window.addEventListener("scroll", rememberPosition, { passive: true });
    frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", rememberPosition);
    };
  }, [location.key, location.pathname, location.hash, navigationType]);
}
