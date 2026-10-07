import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";

const defaultUrl = "https://test4test.io/";

class CheckFailure extends Error {
  constructor(message, status = "NOT_WORKING") {
    super(message);
    this.status = status;
  }
}

function requireCheck(condition, message) {
  if (!condition) throw new CheckFailure(message);
}

function profileMenu(page) {
  return page.getByRole("button", { name: "Profile menu", exact: true }).filter({ visible: true }).first();
}

async function openProfile(page, assertion) {
  const menu = profileMenu(page);
  const link = page.getByRole("link", { name: "Profile", exact: true }).filter({ visible: true }).first();
  await assertion(menu.or(link).first()).toBeVisible();
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  } else {
    await link.click();
  }
}

async function assertAuthenticatedProfile(page, assertion, email) {
  await assertion(page).toHaveURL((url) => /\/profile\/?$/.test(url.pathname));
  const emailText = page.getByText(email, { exact: true }).filter({ visible: true }).first();
  const emailField = page.getByRole("textbox", { name: "Email address", exact: true }).filter({ visible: true }).first();
  await assertion(emailText.or(emailField).first()).toBeVisible();
  if (await emailField.isVisible()) await assertion(emailField).toHaveValue(email);
  const menu = profileMenu(page);
  const signOut = page.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true }).first();
  await assertion(menu.or(signOut).first()).toBeVisible();
  if (await menu.isVisible()) {
    await menu.click();
    await assertion(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
    // Inspect the authenticated action without signing out the shared account.
    await page.keyboard.press("Escape");
  } else {
    await assertion(signOut).toBeVisible();
  }
}

// A fresh browser context is essential: an existing session must never make a
// broken login flow pass. Do not record traces, cookies, tokens, or screenshots.
export async function checkAuth(env = process.env) {
  const startedAt = new Date();
  const url = env.AUTH_CHECK_URL || defaultUrl;
  const email = (env.AUTH_CHECK_EMAIL || "test@test4test.io").trim().toLowerCase();
  const passcode = env.TEST_ACCOUNT_OTP_CODE?.trim();
  const timeout = Number(env.AUTH_CHECK_TIMEOUT_MS || 30000);
  const result = {
    timestamp: startedAt.toISOString(),
    url: defaultUrl,
    scope: "test-account login and session persistence; email delivery is not tested",
    status: "BLOCKED",
    stage: "configuration",
    reason: "",
    duration_ms: 0,
  };
  let browser;
  try {
    const target = new URL(url);
    if (target.username || target.password || target.search || target.hash ||
        !(target.protocol === "https:" || (target.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(target.hostname)))) {
      throw new CheckFailure("AUTH_CHECK_URL must be HTTPS without credentials or query parameters (local HTTP is allowed).", "BLOCKED");
    }
    result.url = target.href;
    if (!passcode) throw new CheckFailure("TEST_ACCOUNT_OTP_CODE is not configured in the runner's secrets.", "BLOCKED");
    if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
      throw new CheckFailure("AUTH_CHECK_TIMEOUT_MS must be between 1000 and 120000.", "BLOCKED");
    }

    result.stage = "browser_start";
    const proxy = env.HTTPS_PROXY || env.HTTP_PROXY;
    browser = await chromium.launch({
      ...(env.AUTH_CHECK_CHROMIUM_PATH ? { executablePath: env.AUTH_CHECK_CHROMIUM_PATH } : {}),
      ...(proxy ? { proxy: { server: proxy, bypass: env.NO_PROXY || "" } } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    const assertion = expect.configure({ timeout });

    result.stage = "open_site";
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded" });
    requireCheck(response?.ok(), `The requested page returned HTTP ${response?.status() ?? "unknown"}.`);

    result.stage = "open_login";
    // Start at the configured homepage and follow its actual login link.
    // Never silently substitute a different landing page when this one fails.
    const loginLink = page.getByRole("link", { name: /^(log in|sign in)$/i }).filter({ visible: true }).first();
    await assertion(loginLink).toBeVisible();
    const loginUrl = new URL(await loginLink.getAttribute("href"), page.url());
    requireCheck(loginUrl.origin === target.origin, "The login link points to an unexpected origin.");
    await loginLink.click();
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);

    result.stage = "request_code";
    // The dedicated account uses Continue. Refuse the email flow so this check
    // cannot send repeated login emails to a user's personal or support inbox.
    const continueButton = page.getByRole("button", { name: "Continue", exact: true });
    await assertion(continueButton).toBeVisible().catch(() => {
      throw new CheckFailure("The deployed site did not offer the configured test-account flow.", "BLOCKED");
    });
    await continueButton.click();
    await page.getByRole("textbox", { name: "Test account passcode", exact: true }).fill(passcode);

    result.stage = "verify_code";
    const loginResponsePromise = page.waitForResponse((r) =>
      new URL(r.url()).pathname === "/functions/v1/test-account-login" && r.request().method() === "POST",
    ).catch(() => null);
    const identityResponsePromise = page.waitForResponse((r) =>
      new URL(r.url()).pathname === "/auth/v1/user" && r.request().method() === "GET",
    ).catch(() => null);
    await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
    const loginResponse = await loginResponsePromise;
    requireCheck(loginResponse, "The test-account login did not respond before the timeout.");
    requireCheck(loginResponse.ok(), `The test-account login returned HTTP ${loginResponse.status()}.`);
    const login = await loginResponse.json();
    requireCheck(login.ok && login.session?.access_token && login.session?.refresh_token,
      "The login response did not contain a complete session.");

    result.stage = "validate_identity";
    const identityResponse = await identityResponsePromise;
    requireCheck(identityResponse?.ok(), "The authentication server did not validate the new session.");
    requireCheck(new URL(identityResponse.url()).origin === new URL(loginResponse.url()).origin,
      "The session validation came from an unexpected authentication server.");
    const user = await identityResponse.json();
    requireCheck(user.id && user.id === login.session.user?.id && user.email?.toLowerCase() === email,
      "The authenticated identity did not match the test account.");

    result.stage = "authenticated_profile";
    await openProfile(page, assertion);
    await assertAuthenticatedProfile(page, assertion, email);

    result.stage = "reload_session";
    const reload = await page.reload({ waitUntil: "domcontentloaded" });
    requireCheck(reload?.ok(), "The authenticated page failed to reload.");
    await assertAuthenticatedProfile(page, assertion, email);
    result.status = "WORKING";
    result.stage = "complete";
    result.reason = "Login succeeded, the server validated the test user, and the authenticated profile survived a reload.";
  } catch (error) {
    if (error instanceof CheckFailure) {
      result.status = error.status;
      result.reason = error.message;
    } else if (["configuration", "browser_start"].includes(result.stage)) {
      result.status = "BLOCKED";
      result.reason = "The runner configuration or Chromium installation is unavailable.";
    } else if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED/.test(error.message || "")) {
      result.status = "BLOCKED";
      result.reason = "The runner's network proxy blocked or could not reach the destination.";
    } else {
      result.status = "NOT_WORKING";
      // Playwright errors can include input values and response bodies. Keep
      // them out of stdout, artifacts, and the GitHub summary.
      result.reason = `The ${result.stage} step failed or timed out.`;
    }
  } finally {
    await browser?.close().catch(() => {});
    result.duration_ms = Date.now() - startedAt.getTime();
  }
  return result;
}

export async function writeResult(result, env = process.env) {
  const outputDir = resolve(env.AUTH_CHECK_LOG_DIR || "artifacts/auth-check");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  await appendFile(resolve(outputDir, "history.jsonl"), `${JSON.stringify(result)}\n`, { mode: 0o600 });
  const summary = `### Authentication: ${result.status}\n\n` +
    `- Time: ${result.timestamp}\n- Target: ${result.url}\n- Stage: ${result.stage}\n` +
    `- Result: ${result.reason}\n- Coverage: ${result.scope}\n`;
  await writeFile(resolve(outputDir, "summary.md"), summary);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkAuth();
  await writeResult(result);
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "WORKING" ? 0 : result.status === "BLOCKED" ? 2 : 1;
}
