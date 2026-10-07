import { prepareEmailAccountDrafts } from "./accountDrafts";
import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export class EmailAccessError extends Error {
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

const invalidMessage =
  "This email sign-in link is invalid, has been revoked, or no longer matches an available account. Sign in normally to continue.";
const temporaryMessage =
  "We couldn’t sign you in right now. Try again in a moment. Your email link is still reusable.";

export function createEmailAccessExchange(initialToken: string) {
  let token = initialToken;
  let pending: Promise<string> | null = null;
  const exchange = async () => {
    if (!token) throw new EmailAccessError(false, invalidMessage);
    const client = requireSupabase();
    const { data: before } = await client.auth.getSession();
    const response = await fetch(`${supabaseUrl}/functions/v1/redeem-email-link`, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(35000),
      headers: {
        "Content-Type": "application/json",
        apikey: supabasePublishableKey,
        ...(before.session ? { Authorization: `Bearer ${before.session.access_token}` } : {}),
      },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        token = "";
        throw new EmailAccessError(false, invalidMessage);
      }
      throw new EmailAccessError(true, temporaryMessage);
    }
    // Defense in depth: only canonical, same-origin destinations are accepted.
    if (
      typeof result.userId !== "string" ||
      typeof result.destination !== "string" ||
      !/^\/(recordings\?response=|test\/[0-9a-f-]+\?)/.test(result.destination) ||
      new URL(result.destination, location.origin).origin !== location.origin
    ) {
      throw new EmailAccessError(true, temporaryMessage);
    }
    prepareEmailAccountDrafts(before.session?.user.id ?? null, result.userId);
    if (!result.reuseSession) {
      const installed = await client.auth.setSession(result.session);
      if (installed.error || installed.data.user?.id !== result.userId) {
        throw new EmailAccessError(true, temporaryMessage);
      }
    }
    const current = await client.auth.getSession();
    if (current.data.session?.user.id !== result.userId)
      throw new EmailAccessError(true, temporaryMessage);
    token = "";
    return result.destination as string;
  };
  return () => {
    // React StrictMode and double clicks share an exchange; retry starts a new one.
    if (!pending)
      pending = exchange().catch((error: unknown) => {
        pending = null;
        throw error instanceof EmailAccessError
          ? error
          : new EmailAccessError(true, temporaryMessage);
      });
    return pending;
  };
}
