import { expect, test } from "@playwright/test";

const homeFeedbackQuotes = [
  "“I knew exactly what to do next.”",
  "“The save button was easy to miss.”",
  "“The sign-up flow felt quick.”",
  "“I wanted clearer pricing.”",
  "“The navigation made sense.”",
  "“I wasn’t sure my changes saved.”",
  "“The page felt fast and focused.”",
  "“I’d make the main action stand out.”",
] as const;

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Design-system journeys must not contact Supabase: ${route.request().url()}`);
  });
});

test("home starts a named submission without losing the draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "App name" }).fill("Checkout audit");
  await page
    .getByRole("region", { name: "Get free user testing on your web or mobile app" })
    .getByRole("button", { name: "Get started" })
    .click();
  await expect(page).toHaveURL(/\/submit(?:\?|$)/);
  await expect(page.getByRole("textbox", { name: "App name" })).toHaveValue("Checkout audit");
});

test("home hover feedback pauses before continuing without repeating while hovered", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const panel = page.getByTestId("home-hero-panel");
  const quote = page.getByTestId("home-hover-feedback");
  const panelBounds = await panel.boundingBox();
  if (!panelBounds) throw new Error("Expected the home hero panel to have layout bounds.");

  await page.mouse.move(0, 0);
  const entryPoint = {
    x: panelBounds.x + 8,
    y: panelBounds.y + 8,
  };
  await page.mouse.move(entryPoint.x, entryPoint.y);

  await expect(quote).toBeVisible();
  await expect(quote).toHaveAttribute("aria-hidden", "true");
  await expect(quote).toHaveAttribute("data-phase", "visible");
  await expect(quote).toHaveCSS("pointer-events", "none");
  await expect(quote).toHaveCSS("transition-property", "opacity");
  await quote.evaluate((element) => {
    const fadeState = window as Window & {
      __homeFeedbackFadeState?: {
        elapsedMilliseconds: number | null;
        nextAddedAt: number | null;
        removedAt: number | null;
        started: boolean;
        visibleAt: number;
      };
    };
    fadeState.__homeFeedbackFadeState = {
      elapsedMilliseconds: null,
      nextAddedAt: null,
      removedAt: null,
      started: false,
      visibleAt: performance.now(),
    };

    const panelElement = element.parentElement;
    const quoteCycleObserver = new MutationObserver(() => {
      const currentFadeState = fadeState.__homeFeedbackFadeState;
      if (!currentFadeState || !panelElement) return;

      const currentQuote = panelElement.querySelector('[data-testid="home-hover-feedback"]');
      if (!currentQuote && currentFadeState.removedAt === null) {
        currentFadeState.removedAt = performance.now();
      } else if (
        currentQuote &&
        currentFadeState.removedAt !== null &&
        currentFadeState.nextAddedAt === null
      ) {
        currentFadeState.nextAddedAt = performance.now();
        quoteCycleObserver.disconnect();
      }
    });
    if (panelElement) quoteCycleObserver.observe(panelElement, { childList: true });

    element.addEventListener(
      "transitionrun",
      () => {
        const currentFadeState = fadeState.__homeFeedbackFadeState;
        if (!currentFadeState) return;
        currentFadeState.elapsedMilliseconds = performance.now() - currentFadeState.visibleAt;
        currentFadeState.started = true;
      },
      { once: true },
    );
  });

  const firstText = (await quote.textContent()) ?? "";
  expect(homeFeedbackQuotes).toContain(firstText);

  const firstQuoteBounds = await quote.boundingBox();
  if (!firstQuoteBounds) throw new Error("Expected the feedback quote to have layout bounds.");

  expect(firstQuoteBounds.x).toBeGreaterThanOrEqual(panelBounds.x - 1);
  expect(firstQuoteBounds.x + firstQuoteBounds.width).toBeLessThanOrEqual(
    panelBounds.x + panelBounds.width + 1,
  );
  expect(firstQuoteBounds.y).toBeGreaterThan(entryPoint.y);
  expect(firstQuoteBounds.y + firstQuoteBounds.height).toBeLessThanOrEqual(
    panelBounds.y + panelBounds.height + 1,
  );

  const quoteInterceptsPointer = await quote.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    return hitTarget === element || (hitTarget !== null && element.contains(hitTarget));
  });
  expect(quoteInterceptsPointer).toBe(false);

  const continuationPoint = {
    x: panelBounds.x + panelBounds.width - 8,
    y: panelBounds.y + panelBounds.height / 2,
  };
  await page.mouse.move(continuationPoint.x, continuationPoint.y);
  await expect(quote).toHaveCount(1);
  await expect(quote).toHaveText(firstText);

  const fixedQuoteBounds = await quote.boundingBox();
  if (!fixedQuoteBounds) throw new Error("Expected the feedback quote to remain visible.");
  expect(Math.abs(fixedQuoteBounds.x - firstQuoteBounds.x)).toBeLessThan(1);
  expect(Math.abs(fixedQuoteBounds.y - firstQuoteBounds.y)).toBeLessThan(1);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __homeFeedbackFadeState?: { started: boolean };
              }
            ).__homeFeedbackFadeState?.started ?? false,
        ),
      { timeout: 3_000 },
    )
    .toBe(true);
  const fadeElapsedMilliseconds = await page.evaluate(
    () =>
      (
        window as Window & {
          __homeFeedbackFadeState?: { elapsedMilliseconds: number | null };
        }
      ).__homeFeedbackFadeState?.elapsedMilliseconds ?? 0,
  );
  expect(fadeElapsedMilliseconds).toBeGreaterThanOrEqual(1_700);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __homeFeedbackFadeState?: { removedAt: number | null };
              }
            ).__homeFeedbackFadeState?.removedAt ?? null,
        ),
      { timeout: 1_000 },
    )
    .not.toBeNull();
  await page.waitForTimeout(500);
  await expect(quote).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const currentText = await quote.evaluateAll((elements) => elements[0]?.textContent ?? "");
        return (
          currentText !== firstText &&
          homeFeedbackQuotes.includes(currentText as (typeof homeFeedbackQuotes)[number])
        );
      },
      { timeout: 2_000 },
    )
    .toBe(true);
  await expect(quote).toBeVisible();
  await expect(quote).toHaveCount(1);

  const secondText = (await quote.textContent()) ?? "";
  expect(homeFeedbackQuotes).toContain(secondText);
  expect(secondText).not.toBe(firstText);

  const cyclePauseMilliseconds = await page.evaluate(() => {
    const cycleState = (
      window as Window & {
        __homeFeedbackFadeState?: {
          nextAddedAt: number | null;
          removedAt: number | null;
        };
      }
    ).__homeFeedbackFadeState;
    if (!cycleState || cycleState.nextAddedAt === null || cycleState.removedAt === null) return 0;
    return cycleState.nextAddedAt - cycleState.removedAt;
  });
  expect(cyclePauseMilliseconds).toBeGreaterThanOrEqual(900);
  expect(cyclePauseMilliseconds).toBeLessThan(2_000);

  const secondQuoteBounds = await quote.boundingBox();
  if (!secondQuoteBounds) throw new Error("Expected the second quote to have layout bounds.");
  expect(secondQuoteBounds.x).toBeGreaterThanOrEqual(panelBounds.x - 1);
  expect(secondQuoteBounds.x + secondQuoteBounds.width).toBeLessThanOrEqual(
    panelBounds.x + panelBounds.width + 1,
  );
  expect(secondQuoteBounds.y + secondQuoteBounds.height).toBeLessThanOrEqual(continuationPoint.y);

  const textbox = page.getByRole("textbox", { name: "App name" });
  await textbox.click();
  await textbox.fill("Hover feedback test");
  await panel.getByRole("button", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/submit\?productName=Hover%20feedback%20test$/);
});

test("home hover feedback ignores touch-like and pen pointer entry", async ({ page }) => {
  await page.goto("/");

  const panel = page.getByTestId("home-hero-panel");
  const quote = page.getByTestId("home-hover-feedback");
  const panelBounds = await panel.boundingBox();
  if (!panelBounds) throw new Error("Expected the home hero panel to have layout bounds.");

  for (const [index, pointerType] of ["touch", "pen"].entries()) {
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: panelBounds.x + panelBounds.width / 2,
      clientY: panelBounds.y + panelBounds.height / 2,
      composed: true,
      isPrimary: true,
      pointerId: index + 10,
      pointerType,
    };

    await panel.dispatchEvent("pointerover", eventInit);
    await page.waitForTimeout(50);
    await expect(quote).toHaveCount(0);
    await panel.dispatchEvent("pointerout", eventInit);
  }

  await page.mouse.move(0, 0);
  await page.mouse.move(
    panelBounds.x + panelBounds.width / 2,
    panelBounds.y + panelBounds.height / 2,
  );
  await expect(quote).toBeVisible();
});

test("home hover feedback is suppressed for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const panel = page.getByTestId("home-hero-panel");
  const quote = page.getByTestId("home-hover-feedback");

  await panel.hover({ position: { x: 32, y: 32 } });
  await page.waitForTimeout(50);
  await expect(quote).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(quote).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(quote).toHaveCount(0);
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

test("Earn platform preferences expose named checkbox choices and save accessibly", async ({
  page,
}) => {
  await page.goto("/earn?ds-user=user-avery");

  const dialog = page.getByRole("dialog", {
    name: "What platforms can you reliably access?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(3);

  const websites = dialog.getByRole("checkbox", { name: "Websites" });
  await websites.focus();
  await page.keyboard.press("Space");
  await expect(websites).not.toBeChecked();

  await dialog.getByRole("button", { name: "Save preferences" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Choose platforms you can test/ })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Enable screen sharing" })).toHaveCount(0);
  await expect(page.getByText("Screen", { exact: true })).toBeVisible();
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
