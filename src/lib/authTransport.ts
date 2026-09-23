export const AUTH_REQUEST_TIMEOUT_MS = 15_000;
export const AUTH_TIMEOUT_MESSAGE =
  "The sign-in service took too long to respond. Please try again in a few minutes.";
export const AUTH_UNAVAILABLE_MESSAGE =
  "The sign-in service is temporarily unavailable. Please try again in a few minutes.";

/** Bound sign-in requests without retrying sends, verification, or token rotation. */
export function createAuthFetch(
  supabaseUrl: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): typeof fetch {
  const authUrl = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/`);
  const testAccountPath = "/functions/v1/test-account-login";

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (
      url.origin !== authUrl.origin ||
      (!url.pathname.startsWith(authUrl.pathname) && url.pathname !== testAccountPath)
    ) {
      return fetcher(input, init);
    }

    const controller = new AbortController();
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new DOMException(AUTH_TIMEOUT_MESSAGE, "TimeoutError")),
      timeoutMs,
    );

    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      // Keep the deadline active through the small JSON body, not just the headers.
      const body = response.body ? await response.arrayBuffer() : null;
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      // Body reads can replace the abort reason with a generic AbortError.
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  };
}

export function getAuthErrorMessage(error: { message: string; name?: string; status?: number }) {
  const isConnectionFailure =
    error.name === "AuthRetryableFetchError" ||
    error.name === "FunctionsFetchError" ||
    error.name === "FunctionsRelayError" ||
    /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(
      error.message,
    );

  if (isConnectionFailure && typeof navigator !== "undefined" && !navigator.onLine) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (error.message === AUTH_TIMEOUT_MESSAGE) return AUTH_TIMEOUT_MESSAGE;
  if (isConnectionFailure || (error.status !== undefined && error.status >= 500)) {
    return AUTH_UNAVAILABLE_MESSAGE;
  }
  if (!error.message.trim() || /^(?:\{\s*\}|\[\s*\]|null|undefined)$/.test(error.message.trim())) {
    return AUTH_UNAVAILABLE_MESSAGE;
  }
  // Preserve actionable API messages such as rate limits and invalid/expired codes.
  return error.message;
}

/** Edge Functions wrap transport failures in context and HTTP errors in a Response. */
export async function getTestAccountLoginErrorMessage(error: unknown, fallbackMessage: string) {
  const context =
    typeof error === "object" && error !== null && "context" in error ? error.context : null;

  if (context instanceof Response) {
    if (context.status >= 500) return AUTH_UNAVAILABLE_MESSAGE;
    const payload = (await context
      .clone()
      .json()
      .catch(() => null)) as { error?: unknown; message?: unknown } | null;
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : fallbackMessage;
    return getAuthErrorMessage({ message, status: context.status });
  }

  if (
    typeof context === "object" &&
    context !== null &&
    "message" in context &&
    context.message === AUTH_TIMEOUT_MESSAGE
  ) {
    return AUTH_TIMEOUT_MESSAGE;
  }
  return error instanceof Error ? getAuthErrorMessage(error) : fallbackMessage;
}
