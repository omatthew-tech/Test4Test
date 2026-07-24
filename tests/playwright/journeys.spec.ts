import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Design-system journeys must not contact Supabase: ${route.request().url()}`);
  });
});

test("home starts a named submission without losing the draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "What's the name of your app?" }).fill("Checkout audit");
  await page
    .getByRole("region", { name: "Get free user testing on your web or mobile app" })
    .getByRole("button", { name: "Get started" })
    .click();
  await expect(page).toHaveURL(/\/submit(?:\?|$)/);
  await expect(page.getByRole("textbox", { name: "App name" })).toHaveValue("Checkout audit");
});

test("public audience selection reaches the tester landing route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get paid to test" }).first().click();
  await expect(page).toHaveURL(/\/get-paid-to-test$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Make over $22/hour testing websites and apps",
    }),
  ).toBeVisible();
});

test("test-account sign-in exposes the passcode state and recovery path", async ({ page }) => {
  await page.goto("/sign-in");
  const email = page.getByRole("textbox", { name: "Email address" });
  await email.fill("avery@demo.test4test.app");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter test passcode" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Test account passcode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveValue(
    "avery@demo.test4test.app",
  );
});

test("submission wizard exposes validation and keyboard-operable choices", async ({ page }) => {
  await page.goto("/submit");
  const continueButton = page.getByRole("button", { name: /Continue/ });
  await continueButton.click();
  await expect(page.getByText("Add an app name to continue.")).toBeVisible();
  await page.getByRole("textbox", { name: "App name" }).fill("Keyboard test");
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByRole("heading", { name: "What kind of app is it?" })).toBeVisible();
  const website = page.getByRole("button", { name: "Website" });
  await website.focus();
  await page.keyboard.press("Space");
  await expect(website).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "What's the link to your app?" })).toBeVisible();
});

test("My Tests share and edit dialogs close with Escape and restore focus", async ({ page }) => {
  await page.goto("/my-tests?ds-user=user-mateo");

  const edit = page.getByRole("button", { name: "Edit app" }).first();
  await edit.click();
  await expect(page.getByRole("dialog", { name: "Edit app" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit app" })).not.toBeVisible();
  await expect(edit).toBeFocused();

  const share = page.getByRole("button", { name: "Share test" }).first();
  await expect(share).toBeEnabled();
  await share.click();
  const dialog = page.getByRole("dialog", { name: "Share test" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Share test link" })).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Add a custom message (optional)" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(share).toBeFocused();
});

test("response viewer navigation exposes each response without changing data", async ({ page }) => {
  await page.goto("/my-tests/submission-palette?ds-user=user-mateo&ds-responses=2");
  await page.getByRole("button", { name: "Individual Responses" }).click();
  await expect(page.getByRole("heading", { name: "Response 1" })).toBeVisible();
  const next = page.getByRole("button", { name: "Next response" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByRole("heading", { name: "Response 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous response" })).toBeEnabled();
});

test("recording permission denial provides recovery guidance and keeps start disabled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
        getDisplayMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/test/submission-palette?ds-user=user-avery&ds-recording=1");
  const enableMicrophone = page.getByRole("button", { name: "Enable microphone" });
  await enableMicrophone.click();
  await expect(
    page
      .getByText(
        "Allow microphone access so you can choose a microphone before starting the test.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start test" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enable screen sharing" })).toBeDisabled();
});

test("test report dialog is keyboard-dismissible and restores focus", async ({ page }) => {
  await page.goto("/test/submission-palette?ds-user=user-avery");
  const trigger = page.getByRole("button", { name: "Report" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Report/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: "Report reason" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("admin decisions require an explicit confirmation and support cancel", async ({ page }) => {
  await page.goto("/admin?ds-user=user-avery&ds-reports=1");
  const decision = page.getByRole("button", { name: "Test is OK" }).first();
  await decision.click();
  await expect(page.getByRole("button", { name: "Confirm test is OK" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Confirm test is OK" })).not.toBeVisible();
  await expect(decision).toBeVisible();
});

test("email previews expose every required transactional state", async ({ page }) => {
  await page.goto("/email-preview?ds-user=user-avery");
  await expect(page.getByRole("heading", { level: 1, name: "Email preview" })).toBeVisible();
  await expect(page.getByText("OTP delivery email")).toBeVisible();
  await expect(page.getByText("Plain feedback email")).toBeVisible();
  await expect(page.getByText("Reminder stage 1")).toBeVisible();
  await expect(page.getByText("Reminder stage 2")).toBeVisible();
  await expect(page.getByText("Final reminder")).toBeVisible();
});
