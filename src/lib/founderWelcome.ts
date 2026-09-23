import { requireSupabase } from "./supabase";

export type FounderWelcomeStatus = "pending" | "completed" | "dismissed";
export type FounderWelcomeOutcome = Exclude<FounderWelcomeStatus, "pending">;

export interface TestAccountWelcomeReplay {
  userId: string;
  signedInAt: string;
  welcomeStatus: FounderWelcomeStatus;
  platformPending: boolean;
}

const replayStoragePrefix = "test4test:test-account-welcome:";
const replayMemory = new Map<string, TestAccountWelcomeReplay>();

export function readTestAccountWelcomeReplay(user: {
  id: string;
  email?: string;
  last_sign_in_at?: string;
}): TestAccountWelcomeReplay | null {
  // This exact-account exception affects presentation only. Read identity from Auth,
  // never editable profile metadata or the configurable demo-account email.
  if (user.email?.trim().toLowerCase() !== "test@test4test.io" || !user.last_sign_in_at) {
    return null;
  }

  let saved: TestAccountWelcomeReplay | null;
  try {
    saved = JSON.parse(sessionStorage.getItem(`${replayStoragePrefix}${user.id}`) ?? "null");
  } catch {
    saved = replayMemory.get(user.id) ?? null;
  }
  if (
    saved?.userId === user.id &&
    saved.signedInAt === user.last_sign_in_at &&
    parseFounderWelcomeStatus(saved.welcomeStatus) &&
    typeof saved.platformPending === "boolean"
  ) {
    return saved;
  }

  return {
    userId: user.id,
    signedInAt: user.last_sign_in_at,
    welcomeStatus: "pending",
    platformPending: true,
  };
}

export function saveTestAccountWelcomeReplay(
  replay: TestAccountWelcomeReplay | null,
  changes: Partial<Pick<TestAccountWelcomeReplay, "welcomeStatus" | "platformPending">>,
) {
  if (!replay) return null;
  const next = { ...replay, ...changes };
  replayMemory.set(next.userId, next);
  try {
    sessionStorage.setItem(`${replayStoragePrefix}${next.userId}`, JSON.stringify(next));
  } catch {
    // Closing still works for this page session when browser storage is unavailable.
  }
  return next;
}

export function parseFounderWelcomeStatus(value: unknown): FounderWelcomeStatus | null {
  return value === "pending" || value === "completed" || value === "dismissed" ? value : null;
}

export async function saveFounderWelcome(userId: string, outcome: FounderWelcomeOutcome) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) {
    throw new Error("Your sign-in changed. Please try again.");
  }
  // User-editable presentation preference, never authorization data.
  const { error: saveError } = await supabase.auth.updateUser({
    data: { founder_welcome_v1: outcome },
  });
  if (saveError) throw saveError;
}
