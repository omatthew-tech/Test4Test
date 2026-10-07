import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const token = "ab".repeat(32);
const recipient = "41000000-0000-4000-8000-000000000001";
const other = "41000000-0000-4000-8000-000000000002";
const responseId = "41000000-0000-4000-8000-000000000004";
const destination = `/recordings?response=${responseId}&earn_entry=feedback_email`;
const authOrigin = "https://email-access.supabase.test";
function session(id: string) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: [
      "eyJhbGciOiJIUzI1NiJ9",
      Buffer.from(JSON.stringify({ sub: id, exp: expires })).toString("base64url"),
      "c2lnbmF0dXJl",
    ].join("."),
    refresh_token: `refresh-${id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expires,
    user: {
      id,
      email: `${id}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}
test.beforeEach(async ({ page }) => {
  await page.route(`${authOrigin}/**`, (route) => {
    throw new Error(`Unexpected Auth request: ${new URL(route.request().url()).pathname}`);
  });
});

for (const initialAccount of [null, recipient, other]) {
  test(`authenticates from ${initialAccount === null ? "a fresh browser" : initialAccount === recipient ? "a matching session" : "another account"} and opens the exact feedback`, async ({
    page,
  }) => {
    const initialSession = initialAccount ? session(initialAccount) : null;
    if (initialAccount) {
      await page.addInitScript(
        ({ saved }) => {
          if (!localStorage.getItem("sb-email-access-auth-token"))
            localStorage.setItem("sb-email-access-auth-token", JSON.stringify(saved));
        },
        { saved: initialSession },
      );
    }
    let exchanges = 0;
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route(`${authOrigin}/auth/v1/user`, (route) =>
      route.fulfill({ json: session(recipient).user }),
    );
    await page.route(`${authOrigin}/functions/v1/redeem-email-link`, async (route) => {
      exchanges++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ token });
      if (initialSession)
        expect(route.request().headers().authorization).toBe(
          `Bearer ${initialSession.access_token}`,
        );
      await route.fulfill({
        json: {
          userId: recipient,
          destination,
          reuseSession: initialAccount === recipient,
          session: session(recipient),
        },
      });
    });
    await page.route(`**/recordings?response=${responseId}&earn_entry=feedback_email`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<main><h1>Exact feedback destination</h1></main>",
      }),
    );
    await page.goto(`/email-access#token=${token}`);
    await expect(page.getByRole("heading", { name: "Exact feedback destination" })).toBeVisible();
    await expect(page).toHaveURL(destination);
    expect(exchanges).toBe(1);
    expect(requests.every((url) => !url.includes(token))).toBe(true);
    expect(requests.some((url) => url.includes("/src/App.tsx"))).toBe(false);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sb-email-access-auth-token") ?? "null"),
    );
    // The document navigation in this test is intercepted; local Auth state persists across it.
    expect(saved.user.id).toBe(recipient);
  });
}

test("scrubs the URL before showing loading, then offers retry for temporary failures", async ({
  page,
}, testInfo) => {
  let finish!: () => void;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let exchanges = 0;
  await page.route(`${authOrigin}/functions/v1/redeem-email-link`, async (route) => {
    exchanges++;
    if (exchanges === 1) await hold;
    await route.fulfill({
      status: exchanges === 1 ? 503 : 401,
      json: { code: exchanges === 1 ? "temporarily_unavailable" : "invalid_link" },
    });
  });
  await page.goto(`/email-access#token=${token}`);
  await expect(page.getByRole("heading", { name: "Signing you in" })).toBeVisible();
  await expect(page).toHaveURL("/email-access");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("email-access-loading.png") });
  finish();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("email-access-retry.png") });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toContainText("has been revoked");
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("email-access-invalid.png") });
  await page.getByRole("button", { name: "Sign in normally" }).click();
  await expect(page).toHaveURL("/sign-in");
});

test("reuses the same emailed credential on repeated visits and after a normal logout", async ({
  page,
}) => {
  const reused: boolean[] = [];
  await page.route(`${authOrigin}/auth/v1/user`, (route) =>
    route.fulfill({ json: session(recipient).user }),
  );
  await page.route(`${authOrigin}/auth/v1/logout?scope=local`, (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route(`${authOrigin}/functions/v1/redeem-email-link`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    const reuseSession = Boolean(route.request().headers().authorization);
    reused.push(reuseSession);
    await route.fulfill({
      json: { userId: recipient, destination, reuseSession, session: session(recipient) },
    });
  });
  await page.route(`**/recordings?response=${responseId}&earn_entry=feedback_email`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main><h1>Exact feedback destination</h1></main>",
    }),
  );
  const visit = async () => {
    await page.goto(`/email-access#token=${token}`);
    await expect(page.getByRole("heading", { name: "Exact feedback destination" })).toBeVisible();
  };
  await visit();
  await visit();
  await page.evaluate(async () => {
    const modulePath = "/src/lib/supabase.ts";
    const { supabase } = await import(modulePath);
    const result = await supabase.auth.signOut({ scope: "local" });
    if (result.error) throw new Error(`Test logout failed: ${result.error.message}`);
  });
  expect(await page.evaluate(() => localStorage.getItem("sb-email-access-auth-token"))).toBeNull();
  await visit();
  expect(reused).toEqual([false, true, false]);
});

test("explains a malformed link without contacting Auth", async ({ page }) => {
  await page.goto("/email-access#token=bad-link");
  await expect(page.getByRole("alert")).toContainText("invalid");
  await expect(page).toHaveURL("/email-access");
});

for (const profile of ["ds-user=user-avery", "ds-tester=locked"]) {
  test(`revokes existing links from ${profile} with accessible success and failure states`, async ({
    page,
  }, testInfo) => {
    let count = 0;
    await page.route(`${authOrigin}/rest/v1/rpc/revoke_my_email_access_links`, (route) => {
      count++;
      return route.fulfill({
        status: count === 1 ? 503 : 200,
        json: count === 1 ? { message: "temporary" } : 2,
      });
    });
    await page.goto(`/profile?${profile}`);
    const button = page.getByRole("button", { name: "Invalidate existing email sign-in links" });
    await button.click();
    await expect(page.getByRole("alert")).toContainText("couldn’t invalidate");
    await button.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Existing email sign-in links" }),
    ).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("email-link-revocation.png") });
  });
}
