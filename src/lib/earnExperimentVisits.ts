export const EARN_ENTRY_SOURCES = [
  "feedback_email",
  "test_back_email",
  "other_email",
  "normal_sign_in",
  "signup_onboarding",
  "shared_link",
  "external_referral",
  "direct_or_unknown",
] as const;
export type EarnEntrySource = (typeof EARN_ENTRY_SOURCES)[number];
export type EarnEntryRoute =
  | "home"
  | "earn"
  | "analytics"
  | "recordings"
  | "test"
  | "shared_link"
  | "sign_in"
  | "signup"
  | "other";
export interface EarnVisit {
  id: string;
  source: EarnEntrySource;
  entryRoute: EarnEntryRoute;
  lastActiveAt: number;
  userId: string | null;
}
const STORAGE_KEY = "test4test:earn-experiment:visit";
export const EARN_VISIT_IDLE_MS = 30 * 60 * 1000;
let memory: EarnVisit | null = null;

export function earnEntryRoute(path: string): EarnEntryRoute {
  if (path === "/") return "home";
  if (path === "/earn") return "earn";
  if (path === "/analytics") return "analytics";
  if (path === "/recordings/shared") return "shared_link";
  if (path.startsWith("/recordings")) return "recordings";
  if (path.startsWith("/test/")) {
    return /^\/test\/[0-9a-f]{8}-[0-9a-f-]{27}(\/|$)/i.test(path) ? "test" : "shared_link";
  }
  if (path === "/sign-in") return "sign_in";
  if (path === "/submit" || path === "/verify") return "signup";
  return "other";
}

function readVisit(): EarnVisit | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as EarnVisit | null;
    if (
      value &&
      /^[0-9a-f-]{36}$/i.test(value.id) &&
      EARN_ENTRY_SOURCES.includes(value.source) &&
      typeof value.lastActiveAt === "number"
    )
      return value;
  } catch {
    /* Storage is optional; keep the visit in memory. */
  }
  return memory;
}
function saveVisit(visit: EarnVisit) {
  memory = visit;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    /* In-memory fallback. */
  }
  return visit;
}

export function currentEarnVisit(userId?: string): EarnVisit {
  const now = Date.now();
  const url = new URL(window.location.href);
  const tag = url.searchParams.get("earn_entry");
  const taggedSource =
    tag && ["feedback_email", "test_back_email", "other_email"].includes(tag)
      ? (tag as EarnEntrySource)
      : null;
  // Consume only our source marker. Reloads then retain the same visit; auth parameters stay intact.
  if (tag !== null) {
    url.searchParams.delete("earn_entry");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  let visit = readVisit();
  const changedUser = Boolean(userId && visit?.userId && visit.userId !== userId);
  if (!visit || taggedSource || changedUser || now - visit.lastActiveAt >= EARN_VISIT_IDLE_MS) {
    const route = earnEntryRoute(url.pathname);
    let source: EarnEntrySource = route === "shared_link" ? "shared_link" : "direct_or_unknown";
    // A referrer is useful only at document entry, never for a later idle session on the same page.
    if (!visit && document.referrer) {
      try {
        if (new URL(document.referrer).origin !== url.origin) source = "external_referral";
      } catch {
        /* Unknown. */
      }
    }
    visit = {
      id: crypto.randomUUID(),
      source: taggedSource ?? source,
      entryRoute: route,
      lastActiveAt: now,
      userId: userId ?? null,
    };
  }
  return saveVisit({ ...visit, lastActiveAt: now, userId: userId ?? visit.userId });
}

export function markEarnAuthentication(signup: boolean) {
  const visit = currentEarnVisit();
  if (!["direct_or_unknown", "normal_sign_in", "signup_onboarding"].includes(visit.source)) return;
  const source = signup ? "signup_onboarding" : "normal_sign_in";
  // A visit already sent to the server is immutable; a new identity avoids racing auth hydration.
  saveVisit({ ...visit, id: crypto.randomUUID(), source, userId: null });
}

export function installEarnVisitActivity() {
  currentEarnVisit();
  const touch = () => currentEarnVisit();
  const visible = () => {
    if (document.visibilityState === "visible") touch();
  };
  window.addEventListener("pointerdown", touch, { passive: true });
  window.addEventListener("keydown", touch);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("pointerdown", touch);
    window.removeEventListener("keydown", touch);
    document.removeEventListener("visibilitychange", visible);
  };
}
