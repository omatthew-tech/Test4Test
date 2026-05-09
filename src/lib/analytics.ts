import { supabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export type AnalyticsEventName =
  | "site_visited"
  | "product_name_entered"
  | "submit_step_viewed"
  | "email_signup_requested"
  | "email_verified"
  | "authenticated_visit"
  | "test_started"
  | "first_test_completed"
  | "test_completed";

const VISITOR_ID_STORAGE_KEY = "test4test:analytics:visitor-id";
const SESSION_TRACKED_EVENTS_KEY = "test4test:analytics:session-tracked-events";
const SESSION_AUTHENTICATED_VISIT_KEY = "test4test:analytics:authenticated-visit-user-id";
const SESSION_ID = createAnalyticsId("session");

type AnalyticsMetadata = Record<string, string | number | boolean | null | undefined>;

function createAnalyticsId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId() {
  if (typeof window === "undefined") {
    return createAnalyticsId("visitor");
  }

  try {
    const stored = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);

    if (stored) {
      return stored;
    }

    const nextVisitorId = createAnalyticsId("visitor");
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, nextVisitorId);
    return nextVisitorId;
  } catch {
    return createAnalyticsId("visitor");
  }
}

function getTrackedSessionEvents() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_TRACKED_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveTrackedSessionEvents(events: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_TRACKED_EVENTS_KEY, JSON.stringify([...events]));
  } catch {
    // Analytics state is best-effort only.
  }
}

export function trackEventOncePerSession(
  eventName: AnalyticsEventName,
  metadata?: AnalyticsMetadata,
  dedupeKey: string = eventName,
) {
  const trackedEvents = getTrackedSessionEvents();

  if (trackedEvents.has(dedupeKey)) {
    return;
  }

  trackedEvents.add(dedupeKey);
  saveTrackedSessionEvents(trackedEvents);
  trackEvent(eventName, metadata);
}

export function trackAuthenticatedVisit(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") {
    return;
  }

  try {
    if (window.sessionStorage.getItem(SESSION_AUTHENTICATED_VISIT_KEY) === userId) {
      return;
    }

    window.sessionStorage.setItem(SESSION_AUTHENTICATED_VISIT_KEY, userId);
  } catch {
    // Still send the event if sessionStorage is unavailable.
  }

  trackEvent("authenticated_visit");
}

export function trackEvent(eventName: AnalyticsEventName, metadata?: AnalyticsMetadata) {
  if (!supabaseUrl || !supabasePublishableKey || typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify({
    eventName,
    visitorId: getVisitorId(),
    sessionId: SESSION_ID,
    metadata: metadata ?? {},
  });
  const url = `${supabaseUrl}/functions/v1/track-analytics-event`;

  void supabase?.auth.getSession().then(({ data }) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
    };

    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && !headers.Authorization) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    void fetch(url, {
      method: "POST",
      headers,
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }).catch(() => undefined);
}
