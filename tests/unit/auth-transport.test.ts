import { createClient, FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TIMEOUT_MESSAGE,
  AUTH_UNAVAILABLE_MESSAGE,
  createAuthFetch,
  getAuthErrorMessage,
  getTestAccountLoginErrorMessage,
} from "../../src/lib/authTransport";

const url = "https://auth.example.test";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("auth request deadlines", () => {
  it("aborts a stalled test-account login without replaying the passcode", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = createClient(url, "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createAuthFetch(url, fetcher) },
    });
    const pending = client.functions.invoke("test-account-login", {
      body: { email: "test@example.test", passcode: "test-passcode" },
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const { error } = await pending;
    expect(await getTestAccountLoginErrorMessage(error, "Fallback")).toBe(AUTH_TIMEOUT_MESSAGE);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the test-account deadline active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("Body aborted", "AbortError")),
              );
            },
          }),
        ),
    );
    const pending = createAuthFetch(url, fetcher)(`${url}/functions/v1/test-account-login`);
    const assertion = expect(pending).rejects.toThrow(AUTH_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled SDK OTP request without resending it", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = createClient(url, "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createAuthFetch(url, fetcher) },
    });
    const pending = client.auth.signInWithOtp({
      email: "member@example.test",
      options: { shouldCreateUser: false },
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const { error } = await pending;
    expect(error?.name).toBe("AuthRetryableFetchError");
    expect(getAuthErrorMessage(error!)).toBe(AUTH_TIMEOUT_MESSAGE);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      email: "member@example.test",
      create_user: false,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves successful responses and clears the deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}', { headers: { "x-request-id": "example" } }));
    const response = await createAuthFetch(url, fetcher)(`${url}/auth/v1/otp`);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-request-id")).toBe("example");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves HTTP errors without retrying", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"message":"Too many requests"}', { status: 429 }));
    const response = await createAuthFetch(url, fetcher)(`${url}/auth/v1/otp`);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ message: "Too many requests" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation from a Request", async () => {
    const caller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const pending = createAuthFetch(
      url,
      fetcher,
    )(
      new Request(`${url}/auth/v1/user`, {
        signal: caller.signal,
      }),
    );
    const assertion = expect(pending).rejects.toThrow("Cancelled by caller");
    caller.abort(new Error("Cancelled by caller"));
    await assertion;
  });

  it.each([
    `${url}/storage/v1/object/recording`,
    `${url}/rest/v1/profiles`,
    `${url}/functions/v1/upload-recording`,
    `${url}/functions/v1/test-account-login-other`,
    "https://other.example.test/auth/v1/otp",
    "https://other.example.test/functions/v1/test-account-login",
  ])("leaves non-auth traffic untouched: %s", async (target) => {
    const response = new Response("untouched");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const init = { method: "POST", body: "payload" };
    expect(await createAuthFetch(url, fetcher)(target, init)).toBe(response);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(target, init);
  });
});

describe("auth error feedback", () => {
  it.each(["{}", " { } ", "[]", "null", "", "  "])(
    "replaces empty serialized errors with useful feedback: %s",
    (message) => {
      expect(getAuthErrorMessage({ message })).toBe(AUTH_UNAVAILABLE_MESSAGE);
    },
  );
  it.each([
    { message: "Failed to fetch" },
    { message: "Load failed" },
    { name: "AuthRetryableFetchError", message: "Gateway Timeout", status: 504 },
    { message: "error code: 522", status: 522 },
  ])("explains a connection or service failure: $message", (error) => {
    expect(getAuthErrorMessage(error)).toBe(AUTH_UNAVAILABLE_MESSAGE);
  });
  it("distinguishes offline browsers", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(getAuthErrorMessage({ message: "Failed to fetch" })).toContain("offline");
  });
  it.each([
    { message: "Token has expired or is invalid", status: 403 },
    { message: "For security purposes, try again after 60 seconds", status: 429 },
  ])("preserves actionable API feedback: $message", (error) => {
    expect(getAuthErrorMessage(error)).toBe(error.message);
  });
});

describe("test-account login error feedback", () => {
  it.each([
    {
      status: 401,
      body: '{"error":"Invalid test account passcode."}',
      expected: "Invalid test account passcode.",
    },
    { status: 401, body: '{"error":"{}"}', expected: AUTH_UNAVAILABLE_MESSAGE },
    { status: 504, body: "<html>Gateway timeout</html>", expected: AUTH_UNAVAILABLE_MESSAGE },
    {
      status: 429,
      body: '{"message":"Try again in 60 seconds."}',
      expected: "Try again in 60 seconds.",
    },
  ])("handles HTTP $status: $body", async ({ status, body, expected }) => {
    const error = new FunctionsHttpError(new Response(body, { status }));
    expect(await getTestAccountLoginErrorMessage(error, "Fallback")).toBe(expected);
  });

  it("explains a function connection failure", async () => {
    const error = new FunctionsFetchError(new TypeError("Failed to fetch"));
    expect(await getTestAccountLoginErrorMessage(error, "Fallback")).toBe(AUTH_UNAVAILABLE_MESSAGE);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await getTestAccountLoginErrorMessage(error, "Fallback")).toContain("offline");
  });
});
