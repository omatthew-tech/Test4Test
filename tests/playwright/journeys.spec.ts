import { expect, test } from "@playwright/test";

const homeFeedbackQuotes = [
  "“I knew exactly what to do next”",
  "“The save button was easy to miss”",
  "“The sign-up flow felt quick”",
  "“I wanted clearer pricing”",
  "“The navigation made sense”",
  "“I wasn’t sure my changes saved”",
  "“The page felt fast and focused”",
  "“I’d make the main action stand out”",
] as const;

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
    throw new Error(`Design-system journeys must not contact Supabase: ${route.request().url()}`);
  });
});

test("selected Get paid to test navigation returns to the home page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/get-paid-to-test");

  const selectedLink = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Get paid to test" });
  await expect(selectedLink).toHaveAttribute("aria-current", "page");
  await selectedLink.click();

  await expect(page).toHaveURL("/");
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Get paid to test" }),
  ).not.toHaveAttribute("aria-current", "page");
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
  const quoteParticles = page.getByTestId("home-hover-feedback-particle");
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
  await expect(quoteParticles).toHaveCount(12);
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

  const entranceMotion = await quote.evaluate((element) => {
    const particles = Array.from(
      element.querySelectorAll<HTMLElement>('[data-testid="home-hover-feedback-particle"]'),
    );
    const quoteText = element.querySelector<HTMLElement>(
      '[data-testid="home-hover-feedback-text"]',
    );
    const rootStyles = window.getComputedStyle(document.documentElement);
    const accentColorProbe = document.createElement("span");
    accentColorProbe.style.color = rootStyles
      .getPropertyValue("--ds-semantic-color-action-primary")
      .trim();
    document.body.append(accentColorProbe);
    const accentColor = window.getComputedStyle(accentColorProbe).color;
    accentColorProbe.remove();
    const quoteAnimations = quoteText?.getAnimations() ?? [];
    const particleAnimations = particles.flatMap((particle) => particle.getAnimations());

    return {
      accentColor,
      quoteAnimationDurations: quoteAnimations.map(
        (animation) => Number(animation.effect?.getTiming().duration) || 0,
      ),
      particleAnimationDurations: particleAnimations.map(
        (animation) => Number(animation.effect?.getTiming().duration) || 0,
      ),
      particleColors: particles.map(
        (particle) => window.getComputedStyle(particle).backgroundColor,
      ),
    };
  });
  expect(entranceMotion.quoteAnimationDurations).toHaveLength(1);
  expect(entranceMotion.quoteAnimationDurations[0]).toBeGreaterThan(0);
  expect(entranceMotion.quoteAnimationDurations[0]).toBeLessThanOrEqual(200);
  expect(entranceMotion.particleAnimationDurations).toHaveLength(12);
  expect(entranceMotion.particleAnimationDurations.every((duration) => duration > 0)).toBe(true);
  expect(entranceMotion.particleAnimationDurations.every((duration) => duration <= 200)).toBe(true);
  expect(entranceMotion.particleColors.every((color) => color === entranceMotion.accentColor)).toBe(
    true,
  );
  await page.waitForTimeout(200);
  await expect(quoteParticles.first()).toHaveCSS("opacity", "0");

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
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);

  const brand = page.getByRole("link", { name: "Test4Test home" });
  const card = page.locator(".sign-in-panel");
  await expect(brand).toBeVisible();
  await expect(card).toBeVisible();

  const brandPosition = await brand.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { center: bounds.left + bounds.width / 2, top: bounds.top };
  });
  const cardPosition = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { center: bounds.left + bounds.width / 2, top: bounds.top };
  });
  expect(Math.abs(brandPosition.center - cardPosition.center)).toBeLessThan(0.5);
  expect(brandPosition.top).toBeLessThan(cardPosition.top);

  const email = page.getByRole("textbox", { name: "Email address" });
  await email.fill("avery@demo.test4test.app");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(brand).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter test passcode" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Test account passcode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveValue(
    "avery@demo.test4test.app",
  );
});

test("submission wizard uses three input steps and an unnumbered review", async ({ page }) => {
  await page.goto("/submit");
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Test4Test home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit a test" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "What's the name of your app?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Share your app and a short task, then review everything before publishing.", {
      exact: true,
    }),
  ).toHaveCount(0);

  const progress = page.getByRole("list", { name: "Progress" });
  const brand = page.getByRole("link", { name: "Test4Test home" });
  await expect(progress).toBeVisible();
  const brandPosition = await brand.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { center: bounds.left + bounds.width / 2, top: bounds.top };
  });
  const progressPosition = await progress.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { center: bounds.left + bounds.width / 2, top: bounds.top };
  });
  expect(Math.abs(brandPosition.center - progressPosition.center)).toBeLessThan(0.5);
  expect(brandPosition.top).toBeLessThan(progressPosition.top);
  await expect(
    progress.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(document.querySelector("h1") as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).resolves.toBe(true);
  const progressItems = progress.getByRole("listitem");
  await expect(progressItems).toHaveCount(3);
  await expect(progressItems.first()).toHaveAttribute("aria-current", "step");
  for (const label of ["App name", "App links", "Instructions"]) {
    await expect(progress.getByText(label, { exact: true })).toHaveClass("ds-sr-only");
  }

  const continueButton = page.getByRole("button", { name: /Continue/ });
  await continueButton.click();
  await expect(page.getByRole("link", { name: "Add an app name to continue." })).toBeVisible();
  await page.getByRole("textbox", { name: "App name" }).fill("Keyboard test");
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(
    page.getByRole("heading", { name: "Where can testers open your app?" }),
  ).toBeVisible();
  await continueButton.click();
  await expect(
    page.getByRole("link", { name: "Add a public website link for testers." }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Website / Web app link" }).fill("test4test.io");

  const linkType = page.getByLabel("Additional link type");
  await linkType.selectOption("ios");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "iOS app link" }).fill("apps.apple.com/app/example");
  await page.getByRole("button", { name: "Remove iOS app link" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "iOS app link" })).toHaveCount(0);

  await linkType.selectOption("figma");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "Figma link" }).fill("figma.com/proto/example");
  await linkType.selectOption("other");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "Other link name" }).fill("Interactive demo");
  await page.getByRole("textbox", { name: "Other link URL" }).fill("example.com/demo");
  await linkType.selectOption("android");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page
    .getByRole("textbox", { name: "Android app link" })
    .fill("play.google.com/store/apps/details?id=example");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Website / Web app link" })).toHaveValue(
    "test4test.io",
  );
  await expect(page.getByRole("textbox", { name: "Figma link" })).toHaveValue(
    "figma.com/proto/example",
  );

  await page.getByRole("button", { name: "Remove Figma link" }).click();
  await expect(page.getByRole("textbox", { name: "Figma link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Other link" }).click();
  await expect(page.getByRole("textbox", { name: "Other link name" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Android app link" }).click();
  await expect(page.getByRole("textbox", { name: "Android app link" })).toHaveCount(0);

  await linkType.selectOption("ios");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "iOS app link" }).fill("apps.apple.com/app/example");
  await linkType.selectOption("android");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page
    .getByRole("textbox", { name: "Android app link" })
    .fill("play.google.com/store/apps/details?id=example");
  await linkType.selectOption("figma");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "Figma link" }).fill("figma.com/proto/example");
  await linkType.selectOption("other");
  await page.getByRole("button", { name: "Add another link" }).click();
  await page.getByRole("textbox", { name: "Other link name" }).fill("Interactive demo");
  await page.getByRole("textbox", { name: "Other link URL" }).fill("example.com/demo");
  await continueButton.click();

  await expect(page.getByRole("heading", { name: "Add instructions" })).toBeVisible();
  await expect(
    page.getByText(
      "Give testers a set of task(s) while they think out loud. This should take around 5-10 minutes to complete.",
    ),
  ).toBeVisible();
  await continueButton.click();
  await expect(
    page.getByRole("link", { name: "Add a task for Step 1 or remove it." }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Step 1" }).fill("Browse the home page.");

  for (let step = 2; step <= 5; step += 1) {
    await page.getByRole("button", { name: "Add another step" }).click();
    await page.getByRole("textbox", { name: `Step ${step}` }).fill(`Complete task ${step}.`);
  }
  await expect(
    page.getByText("Five steps is the maximum for a focused tester task."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Step 5" }).click();
  await expect(page.getByRole("button", { name: "Add another step" })).toBeVisible();

  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Review before publishing" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "App name" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "App links" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Instructions" })).toBeVisible();
  await expect(page.getByText("Screen + voice recording")).toHaveCount(0);
  await expect(page.getByText("What kind of app is it?")).toHaveCount(0);

  const linksReview = page.getByRole("region", { name: "App links" });
  await expect(linksReview.getByText("iOS app", { exact: true })).toBeVisible();
  await expect(linksReview.getByText("Android app", { exact: true })).toBeVisible();
  await expect(linksReview.getByText("Figma", { exact: true })).toBeVisible();
  await expect(linksReview.getByText("Interactive demo", { exact: true })).toBeVisible();
  await linksReview.getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: "Where can testers open your app?" }),
  ).toBeVisible();
});

test("legacy submission drafts migrate to the first missing three-step stage", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "test4test-submit-flow-resume:v1",
      JSON.stringify({
        version: 1,
        phase: "wizard",
        currentStep: 4,
        draft: {
          productName: "Legacy draft",
          productTypes: ["ios"],
          description: "Preserved description",
          targetAudience: "Obsolete audience choice",
          instructions: "Browse the home page and note anything confusing.",
          accessLinks: { ios: "apps.apple.com/app/example" },
          requiresRecording: false,
          needsGooglePlayClosedTesters: true,
          googlePlayClosedTestInstructions: "Obsolete closed-test instructions",
          questionMode: "custom",
        },
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  await page.goto("/submit");
  await expect(
    page.getByRole("heading", { name: "Where can testers open your app?" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "iOS app link" })).toHaveValue(
    "apps.apple.com/app/example",
  );
  await expect(page.getByText("Google Play closed test")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Website / Web app link" }).fill("legacy.example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add instructions" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Step 1" })).toHaveValue(
    "Browse the home page and note anything confusing.",
  );

  const migratedResume = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("test4test-submit-flow-resume:v1") ?? "null"),
  );
  expect(migratedResume).toMatchObject({
    version: 2,
    draft: {
      requiresRecording: true,
      needsGooglePlayClosedTesters: false,
      questionMode: "general",
    },
  });
});

test("Earn edit deep links open owned paused apps and clean the URL after close or save", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.setItem("test4test:earn-platform-filter-confirmed:user-mateo", "true");
  });
  await page.goto("/earn?edit=submission-palette&ds-user=user-mateo&ds-no-live=1");

  const editDialog = page.getByRole("dialog", { name: "Edit app" });
  await expect(editDialog).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("edit")).toBe(false);

  await page.goto("/earn?edit=submission-palette&ds-user=user-mateo&ds-no-live=1");
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editDialog).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("edit")).toBe(false);
});

test("Earn edit deep links reject missing or unauthorized apps and require sign in", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("test4test:earn-platform-filter-confirmed:user-mateo", "true");
  });

  for (const submissionId of ["missing-submission", "submission-pantry"]) {
    await page.goto(`/earn?edit=${submissionId}&ds-user=user-mateo`);
    await expect(page.getByText("App could not be opened", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("edit")).toBe(false);
  }

  await page.goto("/earn?edit=submission-palette");
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/earn?edit=submission-palette");
});

test("Share page saves, resets, copies, and previews the current live test", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { __copiedShareText?: string }).__copiedShareText = value;
        },
      },
    });
  });
  await page.goto("/share?ds-user=user-mateo");

  await expect(page.getByRole("heading", { level: 1, name: "Share" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Share" }),
  ).toHaveAttribute("aria-current", "page");

  const shareLink = page.getByRole("textbox", { name: "Share test link" });
  await expect(shareLink).toHaveValue(/\/test\/palette-pilot$/);
  await shareLink.focus();
  await expect
    .poll(() =>
      shareLink.evaluate(
        (element) =>
          element instanceof HTMLInputElement &&
          element.selectionStart === 0 &&
          element.selectionEnd === element.value.length,
      ),
    )
    .toBe(true);

  const preview = page.getByRole("region", { name: "Shared test preview" });
  await expect(preview.getByText("palettepilot.app", { exact: true })).toBeVisible();
  await expect(
    preview.getByText("Create a board and inspect how easy it is to add references."),
  ).toBeVisible();
  await expect(preview.getByRole("heading", { name: /How easy was it/ }).first()).toBeVisible();

  const message = page.getByRole("textbox", { name: "Add a custom message (optional)" });
  await message.fill("Please review the board-building flow");
  await expect(page.getByText("Message saved.")).toBeVisible();
  await expect(
    preview.getByRole("heading", { level: 3, name: "Please review the board-building flow" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.getByText("The public test link is ready to paste.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __copiedShareText?: string }).__copiedShareText ?? "",
      ),
    )
    .toMatch(/\/test\/palette-pilot$/);

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(preview.getByRole("heading", { level: 3, name: /Congrats!/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toHaveCount(0);
});

test("Share page explains clipboard failure without hiding the manual link", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    });
    document.execCommand = () => false;
  });
  await page.goto("/share?ds-user=user-mateo");

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copy failed" })).toBeVisible();
  await expect(
    page.getByText("We couldn't copy the link. Select the link above and copy it manually."),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Share test link" })).toBeVisible();
});

test("Share page redirects guests and guides members without a live test", async ({ page }) => {
  await page.goto("/share");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fshare$/);

  await page.goto("/share?ds-user=user-mateo&ds-no-live=1");
  await expect(
    page.getByRole("heading", { level: 2, name: "No live test to share" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit an app" })).toHaveAttribute(
    "href",
    "/submit",
  );
});

test("Analytics is authenticated, follows Share in navigation, and exposes static controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=2");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link")).toHaveText([
    "Earn",
    "Share",
    "Analytics",
    "New app",
    "My reviews",
  ]);
  await expect(navigation.getByRole("link", { name: "Analytics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.getByText("You have 2 recordings available", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask about your recordings" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit analytics prompt" })).toBeDisabled();

  for (const action of ["Get more recordings", "Share", "Purchase"]) {
    await expect(page.getByRole("button", { name: action })).toBeDisabled();
  }

  await expect(page.getByRole("link", { name: "View recordings" })).toHaveAttribute(
    "href",
    "/recordings?ds-user=user-mateo&ds-recordings=2",
  );

  const firstRecording = page.getByRole("link", { name: "Recording 1" });
  await expect(firstRecording).toHaveAttribute(
    "href",
    "/recordings?ds-user=user-mateo&ds-recordings=2&response=response-palette-2",
  );
  await expect(page.getByRole("link", { name: /^Recording/ })).toHaveCount(2);
  await expect(page.getByRole("img", { name: /recording preview$/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Play Recording/ })).toHaveCount(2);
  await expect(page.locator("video")).toHaveCount(0);

  const firstPlay = page.getByRole("button", { name: "Play Recording 1: Palette Pilot" });
  await firstPlay.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('video[aria-label="Recording 1: Palette Pilot"]')).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);

  await page.getByRole("button", { name: "Play Recording 2: Palette Pilot" }).click();
  await expect(page.locator('video[aria-label="Recording 2: Palette Pilot"]')).toBeVisible();
  await expect(page.locator('video[aria-label="Recording 1: Palette Pilot"]')).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(1);

  await firstRecording.click();
  await expect(page).toHaveURL(/\/recordings\?/);
  expect(new URL(page.url()).searchParams.get("response")).toBe("response-palette-2");
  await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();
});

test("Analytics pluralizes recording counts and renders no extra zero-state content", async ({
  page,
}) => {
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=1");
  await expect(page.getByText("You have 1 recording available", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recording 1" })).toBeVisible();

  await page.goto("/analytics?ds-user=user-mateo");
  await expect(page.getByText("You have 0 recordings available", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "View recordings" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Recording/ })).toHaveCount(0);
});

test("Recording view opens the latest video and browses available recordings", async ({ page }) => {
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=2");
  await page.getByRole("link", { name: "View recordings" }).click();

  await expect(page).toHaveURL(/\/recordings\?ds-user=user-mateo&ds-recordings=2$/);
  await expect(page.getByRole("heading", { level: 1, name: "Palette Pilot" })).toBeVisible();
  await expect(page.getByText("Recording view", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Review your latest recording and move through earlier sessions.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Recording 1 of 2: Palette Pilot")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Transcript" })).toBeVisible();
  await expect(page.getByText("Transcript unavailable", { exact: true })).toBeVisible();

  const previous = page.getByRole("button", { name: "Previous recording" });
  const next = page.getByRole("button", { name: "Next recording" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page).toHaveURL(/response=response-palette-1/);
  await expect(page.getByText("Recording 2 of 2", { exact: true })).toBeVisible();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();

  await previous.click();
  await expect(page).toHaveURL(/response=response-palette-2/);
  await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();
});

test("Recording view normalizes invalid selections and exposes empty and error states", async ({
  page,
}) => {
  await page.goto("/recordings?ds-user=user-mateo&ds-recordings=2&response=missing-recording");
  await expect(page).not.toHaveURL(/response=missing-recording/);
  await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();

  await page.goto("/recordings?ds-user=user-mateo");
  await expect(
    page.getByRole("heading", { level: 2, name: "No recordings available" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to analytics" })).toHaveAttribute(
    "href",
    "/analytics",
  );

  await page.goto("/recordings?ds-user=user-mateo&ds-recordings=1&ds-recording-error=1");
  await expect(page.getByRole("alert")).toContainText("Recording unavailable");
  await expect(page.getByRole("button", { name: "Reload video" })).toBeVisible();
});

test("Recording view redirects guests with the complete return URL", async ({ page }) => {
  await page.goto("/recordings?response=response-palette-1");
  await expect(page).toHaveURL(
    /\/sign-in\?returnTo=%2Frecordings%3Fresponse%3Dresponse-palette-1$/,
  );
});

test("Analytics redirects guests to sign in and stays out of guest navigation", async ({
  page,
}) => {
  await page.goto("/analytics");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fanalytics$/);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Analytics" }),
  ).toHaveCount(0);

  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Analytics" }),
  ).toHaveCount(0);
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

test("legacy My Feedback URLs redirect to supported destinations and preserve queries", async ({
  page,
}) => {
  await page.goto("/my-tests?ds-user=user-mateo&source=legacy");
  await expect(page).toHaveURL(/\/analytics\?/);
  expect(new URL(page.url()).searchParams.get("source")).toBe("legacy");

  await page.goto(
    "/my-tests/submission-palette?response=response-palette-2&ds-user=user-mateo&ds-recordings=2",
  );
  await expect(page).toHaveURL(/\/recordings\?/);
  const redirectedUrl = new URL(page.url());
  expect(redirectedUrl.searchParams.get("response")).toBe("response-palette-2");
  expect(redirectedUrl.searchParams.get("ds-recordings")).toBe("2");

  await page.goto("/my-tests/submission-palette?response=response-palette-2");
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/recordings?response=response-palette-2",
  );
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
  await expect(page.getByRole("button", { name: "Open Analytics" })).toHaveCount(4);
});
test("tester signup validates each step and exposes technology help to keyboard users", async ({
  page,
}) => {
  await page.goto("/get-paid-to-test/signup");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("link", { name: "Enter your first name." })).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("Taylor");
  await page.getByRole("button", { name: "Continue" }).click();

  const stateSelect = page.getByRole("combobox", { name: "State (optional)" });
  await expect(stateSelect).toBeDisabled();
  await page.getByRole("combobox", { name: "Country" }).selectOption("US");
  await expect(stateSelect).toBeEnabled();
  await stateSelect.selectOption("New York");
  await page.getByRole("button", { name: "Continue" }).click();

  const technologyHelp = page.getByRole("button", {
    name: "About technology proficiency",
  });
  await technologyHelp.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Founders need feedback from both technical and non-technical people",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();

  await page.getByRole("radio", { name: "Moderately proficient" }).check();
  await page.getByRole("checkbox", { name: "Computer" }).check();
  await page.getByRole("checkbox", { name: "iOS" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: "Full time" }).check();
  const workArea = page.getByRole("combobox", {
    name: "Which area best describes your work?",
  });
  await expect(workArea).toBeVisible();
  await workArea.selectOption("software_development");
  await page.getByRole("radio", { name: "Student" }).check();
  await expect(workArea).toBeHidden();
  await page.getByRole("radio", { name: "Full time" }).check();
  await expect(
    page.getByRole("combobox", { name: "Which area best describes your work?" }),
  ).toHaveValue("");

  await page
    .getByRole("combobox", { name: "Which area best describes your work?" })
    .selectOption("software_development");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "What email should you use to sign in?" }),
  ).toBeFocused();
});

test("tester role routing exposes only Earn, Profile, and test routes", async ({ page }) => {
  await page.goto("/analytics?ds-tester=locked");
  await expect(page).toHaveURL(/\/earn\?ds-tester=locked/);
  await expect(page.getByRole("heading", { name: "Your paid-test progress" })).toBeVisible();

  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNavigation.getByRole("link", { name: "Earn" })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Share" })).toHaveCount(0);
  await expect(primaryNavigation.getByRole("link", { name: "Analytics" })).toHaveCount(0);

  await page.goto("/profile?ds-tester=locked");
  await expect(page.getByRole("heading", { name: "Your tester profile" })).toBeVisible();
  await expect(page.getByText(/Submit your app/i)).toHaveCount(0);

  await page.goto("/test/submission-trail/success?ds-tester=locked");
  await expect(page.getByRole("link", { name: "Return to Earn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View analytics" })).toHaveCount(0);
});

test("tester Earn separates locked progress from unlocked paid availability", async ({ page }) => {
  await page.goto("/earn?ds-tester=locked");
  await expect(page.getByText("Credited tests: 1 of 2")).toBeVisible();
  await expect(page.getByText("5-star ratings: 1 of 2")).toBeVisible();
  await expect(page.getByText("Paid test", { exact: true })).toHaveCount(0);

  await page.goto("/earn?ds-tester=unlocked&ds-paid=1");
  await expect(page.getByRole("heading", { name: "Paid tests unlocked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paid Research Preview" })).toBeVisible();
  await expect(page.getByText("Paid test", { exact: true })).toBeVisible();

  await page.goto("/earn?ds-tester=unlocked");
  await expect(
    page.getByRole("heading", { name: "No paid tests are available right now" }),
  ).toBeVisible();
  await expect(
    page.getByText("Test4Test will email you when a new matching paid test appears."),
  ).toBeVisible();
});
