import AxeBuilder from "@axe-core/playwright";
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`home free-feedback methods stay visible and reflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const section = page.getByTestId("free-feedback-section");
    const methods = section.getByRole("article");
    await expect(methods).toHaveCount(2);
    await expect(section.getByRole("heading", { level: 2 })).toHaveText([
      "Test other founders",
      "Bring your own testers",
    ]);
    await expect(section.locator("p")).toHaveText([
      "Earn credits 1:1 (we don't take a cut)",
      "There are no limits - bring as many as you want",
    ]);
    await expect(section.getByRole("button")).toHaveCount(0);
    await expect(section.getByRole("link")).toHaveCount(0);
    await expect(section.getByText("2 free ways to get feedback")).toHaveCount(0);

    for (let index = 0; index < 2; index += 1) {
      const method = methods.nth(index);
      const illustration = method.locator("img");
      await illustration.scrollIntoViewIfNeeded();
      await expect(illustration).toHaveJSProperty("complete", true);
      await expect
        .poll(() => illustration.evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      const imageBounds = await illustration.boundingBox();
      const copyBounds = await method.getByRole("heading").boundingBox();
      expect(imageBounds).not.toBeNull();
      expect(copyBounds).not.toBeNull();
      if (!imageBounds || !copyBounds) throw new Error("Feedback method is not visible");
      expect(imageBounds.x).toBeGreaterThanOrEqual(0);
      expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(viewport.width);
      if (viewport.width < 768) {
        expect(copyBounds.y).toBeGreaterThan(imageBounds.y + imageBounds.height);
      } else if (index === 0) {
        expect(copyBounds.x).toBeGreaterThan(imageBounds.x + imageBounds.width);
      } else {
        expect(imageBounds.x).toBeGreaterThan(copyBounds.x + copyBounds.width);
      }
    }
  });
}

test("home managed recruitment follows the free-feedback showcase and uses animated media", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const freeFeedbackSection = page.getByTestId("free-feedback-section");
  const testableProductsSection = page.getByTestId("home-testable-products-section");
  const managedSection = page.getByTestId("home-managed-recruitment-section");
  const images = managedSection.locator("img");

  await expect(
    managedSection.getByRole("heading", {
      level: 2,
      name: "Most platforms give you tools. We go find the people.",
    }),
  ).toBeVisible();
  await expect(managedSection.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(managedSection.getByRole("button", { name: "Try Test4Test Premium" })).toBeVisible();
  await expect(managedSection.getByText("Pause animations", { exact: true })).toHaveCount(0);
  await expect(images.nth(0)).toHaveAttribute("src", "/images/animations/monkey-typing-loop.webp");
  await expect(images.nth(1)).toHaveAttribute("src", "/images/animations/monkey-vine-loop.webp");

  await expect(freeFeedbackSection.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
    "data-testid",
    "home-testable-products-section",
  );
  await expect(testableProductsSection.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
    "data-testid",
    "home-managed-recruitment-section",
  );
});

test("home managed recruitment uses static posters for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const managedSection = page.getByTestId("home-managed-recruitment-section");
  await expect(managedSection.getByText("Pause animations", { exact: true })).toHaveCount(0);
  await expect(
    managedSection.locator('source[media="(prefers-reduced-motion: reduce)"]'),
  ).toHaveCount(2);
});

test("home Trusted by section shows six Earn cards in an accessible horizontal loop", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?ds-home-trusted=1");

  const section = page.getByTestId("home-trusted-by-section");
  const track = page.getByTestId("home-trusted-by-track");
  const list = section.getByRole("list", { name: "Top tests available on Earn" });

  await expect(
    section.getByRole("heading", {
      level: 2,
      name: /^Trusted by \d[\d,]*\+ global startups$/,
    }),
  ).toBeVisible();
  await expect(list.getByRole("article")).toHaveCount(6);
  const logos = list.getByTestId("home-trusted-logo");
  await expect(logos).toHaveCount(6);
  for (const logo of await logos.all()) {
    await expect(logo).toHaveAttribute("aria-hidden", "true");
    await expect(logo).toHaveCSS("width", "24px");
    await expect(logo).toHaveCSS("height", "24px");
    await expect(logo.locator("img")).toHaveAttribute("alt", "");
    await expect(logo.locator("img")).toHaveCSS("visibility", "visible");
    expect(
      await logo.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }
  await expect(list.getByText(/^(Web|iOS|Android)$/)).toHaveCount(0);
  await expect(list.getByRole("link", { name: "View test" })).toHaveCount(0);
  const openLinks = list.getByRole("link", { name: /^Open .+ test$/ });
  await expect(openLinks).toHaveCount(6);
  await expect(openLinks.first()).toHaveAttribute("href", /^\/test\//);
  await expect(list.getByRole("article").first().locator("p")).toHaveCSS("-webkit-line-clamp", "2");
  const duplicateList = section.locator('ol[aria-hidden="true"]');
  await expect(duplicateList).not.toHaveAttribute("inert");
  for (const link of await duplicateList.locator("a").all()) {
    await expect(link).toHaveAttribute("tabindex", "-1");
  }
  await expect(section.getByTestId("home-trusted-by-pause")).toHaveCount(0);

  const cardPositions = await list.locator("li").evaluateAll((items) =>
    items.slice(0, 2).map((item) => {
      const bounds = item.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top };
    }),
  );
  expect(cardPositions[1]?.left).toBeGreaterThan(cardPositions[0]?.left ?? 0);
  expect(Math.abs((cardPositions[1]?.top ?? 0) - (cardPositions[0]?.top ?? 0))).toBeLessThan(1);

  await page.getByTestId("home-trusted-by-viewport").hover();
  await expect(track).toHaveCSS("animation-play-state", "paused");

  const keyframes = await track.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) =>
        animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [],
      )
      .map((keyframe) => keyframe.transform),
  );
  expect(keyframes[0]).toContain("-");
  expect(keyframes[keyframes.length - 1]).toMatch(/0px|matrix\(1, 0, 0, 1, 0, 0\)/);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const cardHeights = await list
      .getByRole("article")
      .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
    expect(Math.max(...cardHeights) - Math.min(...cardHeights)).toBeLessThanOrEqual(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await testInfo.attach(`trusted-by-${viewport.width}.png`, {
      body: await section.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const duplicate of [false, true]) {
    test(`home Trusted by ${duplicate ? "duplicate" : "primary"} cards open a new tab from their body and padding at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      for (const target of ["body", "padding"]) {
        await page.goto("/?ds-home-trusted=1");
        const section = page.getByTestId("home-trusted-by-section");
        const track = page.getByTestId("home-trusted-by-track");
        await section.scrollIntoViewIfNeeded();
        // Inspect both halves of the loop without waiting for a complete animation cycle.
        await track.evaluate((element, showDuplicate) => {
          for (const animation of element.getAnimations()) {
            animation.pause();
            const duration = Number(animation.effect?.getTiming().duration);
            animation.currentTime = showDuplicate ? duration - 1 : 0;
          }
        }, duplicate);

        const list = duplicate
          ? section.locator('ol[aria-hidden="true"]')
          : section.getByRole("list", { name: "Top tests available on Earn" });
        const card = list.locator("article").first();
        const link = card.locator("a");
        const href = await link.getAttribute("href");
        const bounds = await card.boundingBox();
        if (!bounds || !href) throw new Error("Expected a visible card with an app link");
        const position = {
          x: bounds.width / 2,
          y: target === "body" ? bounds.height - 40 : bounds.height - 8,
        };
        await card.hover({ position });
        await expect(card).toHaveCSS("opacity", "1");
        await expect(track).toHaveCSS("animation-play-state", "paused");
        expect(
          await card.evaluate((element, point) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + point.x, rect.y + point.y);
            return hit ? getComputedStyle(hit).cursor : null;
          }, position),
        ).toBe("pointer");
        const newTabPromise = page.waitForEvent("popup");
        await card.click({ position });
        const newTab = await newTabPromise;
        await expect(newTab).toHaveURL(href);
        await expect(page).toHaveURL("/?ds-home-trusted=1");
        await newTab.close();
      }
    });
  }
}

test("home Trusted by cards open a new tab from the keyboard with a full-card focus ring", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?ds-home-trusted=1");
  const card = page
    .getByRole("list", { name: "Top tests available on Earn" })
    .getByRole("article")
    .first();
  const link = card.getByRole("link");
  const href = await link.getAttribute("href");
  if (!href) throw new Error("Expected an app link");
  await link.focus();
  await expect(card).toHaveCSS("opacity", "1");
  await expect(card).toHaveCSS("outline-style", "solid");
  const newTabPromise = page.waitForEvent("popup");
  await link.press("Enter");
  const newTab = await newTabPromise;
  await expect(newTab).toHaveURL(href);
  await expect(page).toHaveURL("/?ds-home-trusted=1");
  await newTab.close();
});

test("home Trusted by section becomes a static scroller for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?ds-home-trusted=1");

  const section = page.getByTestId("home-trusted-by-section");
  const track = page.getByTestId("home-trusted-by-track");
  const viewport = page.getByTestId("home-trusted-by-viewport");

  await expect(section.getByTestId("home-trusted-by-pause")).toHaveCount(0);
  await expect(section.locator('ol[aria-hidden="true"]')).toBeHidden();
  await expect(track).toHaveCSS("animation-name", "none");
  await expect(viewport).toHaveCSS("overflow-x", "auto");
  await expect(
    section.getByRole("list", { name: "Top tests available on Earn" }).getByRole("article"),
  ).toHaveCount(6);
});

test("home Trusted by logos fall back to initials without changing card geometry or links", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/images/trusted-by/*.png", (route) => route.abort());
  await page.goto("/?ds-home-trusted=1");
  const list = page.getByRole("list", { name: "Top tests available on Earn" });
  const failed = list.getByTestId("home-trusted-logo").nth(1);
  await expect(failed.locator("img")).toHaveCount(0);
  await expect(failed).toHaveText(/\S/);
  await expect(failed).toHaveCSS("width", "24px");
  await expect(list.getByRole("link", { name: /^Open .+ test$/ })).toHaveCount(6);
  await page.goto("/?ds-home-trusted=1&ds-home-logos=missing");
  await expect(list.getByTestId("home-trusted-logo").locator("img")).toHaveCount(0);
  for (const logo of await list.getByTestId("home-trusted-logo").all())
    await expect(logo).toHaveText(/\S/);
  const firstLink = list.getByRole("link", { name: /^Open .+ test$/ }).first();
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
  await expect(page.getByTestId("home-trusted-by-track")).toHaveCSS("animation-name", "none");
});

test("home Trusted by long titles fit beside logos and keep equal card heights", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?ds-home-trusted=1&ds-home-logo-title=long");
  const list = page.getByRole("list", { name: "Top tests available on Earn" });
  const longCard = list
    .getByRole("article")
    .filter({ hasText: "Launch Loom collaborative planning workspace" });
  await expect(longCard.getByRole("heading")).toHaveText(
    "Launch Loom collaborative planning workspace for growing product teams",
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(longCard.getByTestId("home-trusted-logo")).toHaveCSS("width", "24px");
    const heights = await list
      .getByRole("article")
      .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
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

test("home hover feedback stays outside the centered hero content", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const panel = page.getByTestId("home-hero-panel");
  const exclusion = page.getByTestId("home-hero-feedback-exclusion");
  const quote = page.getByTestId("home-hover-feedback");
  const panelBounds = await panel.boundingBox();
  const exclusionBounds = await exclusion.boundingBox();
  if (!panelBounds || !exclusionBounds) {
    throw new Error("Expected the home hero and its feedback exclusion zone to have bounds.");
  }

  await page.mouse.move(0, 0);
  await page.mouse.move(
    exclusionBounds.x + exclusionBounds.width / 2,
    exclusionBounds.y + exclusionBounds.height / 2,
  );
  await page.waitForTimeout(50);
  await expect(quote).toHaveCount(0);

  await page.mouse.move(panelBounds.x + 8, panelBounds.y + 8);
  await expect(quote).toBeVisible();

  await page.mouse.move(
    exclusionBounds.x + exclusionBounds.width / 2,
    exclusionBounds.y + exclusionBounds.height / 2,
  );
  await expect(quote).toHaveCount(0);
  await page.waitForTimeout(1_100);
  await expect(quote).toHaveCount(0);

  await page.mouse.move(panelBounds.x + panelBounds.width - 8, panelBounds.y + 8);
  await expect(quote).toBeVisible();
});

test("home hover feedback stays inactive while the page is scrolled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const panel = page.getByTestId("home-hero-panel");
  const quote = page.getByTestId("home-hover-feedback");
  const panelBounds = await panel.boundingBox();
  if (!panelBounds) throw new Error("Expected the home hero panel to have layout bounds.");

  await page.mouse.move(0, 0);
  await page.mouse.move(panelBounds.x + 8, panelBounds.y + 8);
  await expect(quote).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 1));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(quote).toHaveCount(0);
  await page.waitForTimeout(1_100);
  await expect(quote).toHaveCount(0);

  await page.mouse.move(panelBounds.x + panelBounds.width - 8, panelBounds.y + 8);
  await page.waitForTimeout(50);
  await expect(quote).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(quote).toBeVisible();
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
  await page.mouse.move(panelBounds.x + 8, panelBounds.y + 8);
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

test("Earn edit switches among owned tests and protects unsaved changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("test4test:earn-platform-filter-confirmed:user-mateo", "true");
  });
  await page.goto("/earn?edit=submission-palette&ds-user=user-mateo&ds-multiple-tests=1");

  const editDialog = page.getByRole("dialog", { name: "Edit app" });
  const testSelect = editDialog.getByLabel("Test", { exact: true });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByText("Edit app", { exact: true })).toHaveClass("ds-sr-only");
  await expect(
    editDialog.getByText("Update the app details, resource links, and tester instructions."),
  ).toHaveCount(0);
  const accessibilityResults = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibilityResults.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(testSelect.locator("option")).toHaveText([
    "Palette Pilot (currently in use)",
    "Palette Pilot Mobile (pending review)",
    "Palette Pilot Beta",
  ]);

  await testSelect.selectOption("submission-palette-beta");
  await expect(editDialog.getByRole("button", { name: "Use this test" })).toBeVisible();
  await editDialog.getByRole("button", { name: "Use this test" }).click();
  await expect(
    editDialog.getByRole("heading", {
      name: "Are you sure you want to swap to Palette Pilot Beta?",
    }),
  ).toBeFocused();
  await expect(
    editDialog.getByText(
      "Your current test will stop receiving feedback from the earn page. However, you'll continue receiving feedback from any links you've shared.",
    ),
  ).toBeVisible();
  await editDialog.getByRole("button", { name: "Use this test" }).click();
  await expect(page.getByText("Earn test updated", { exact: true })).toBeVisible();
  await expect(testSelect).toHaveValue("submission-palette-beta");
  await expect(testSelect.locator('option[value="submission-palette-beta"]')).toHaveText(
    "Palette Pilot Beta (currently in use)",
  );

  await testSelect.selectOption("submission-palette-review");
  await expect(editDialog.getByText(/pending review and cannot be used on Earn yet/)).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Use this test" })).toHaveCount(0);

  await editDialog.getByRole("textbox", { name: "App name" }).fill("Unsaved mobile name");
  await testSelect.selectOption("submission-palette");
  await expect(
    editDialog.getByRole("heading", { name: "Discard changes to Palette Pilot Mobile?" }),
  ).toBeFocused();
  await editDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(editDialog.getByRole("textbox", { name: "App name" })).toHaveValue(
    "Unsaved mobile name",
  );
  await testSelect.selectOption("submission-palette");
  await editDialog.getByRole("button", { name: "Discard and continue" }).click();
  await expect(testSelect).toHaveValue("submission-palette");
  await expect(editDialog.getByRole("textbox", { name: "App name" })).toHaveValue("Palette Pilot");

  await editDialog.getByRole("textbox", { name: "App name" }).fill("Another unsaved name");
  await editDialog.getByRole("button", { name: "Add test" }).click();
  await expect(
    editDialog.getByRole("heading", { name: "Discard changes to Palette Pilot?" }),
  ).toBeVisible();
  await editDialog.getByRole("button", { name: "Discard and continue" }).click();
  await expect(page).toHaveURL(/\/submit$/);
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
  await expect(preview.getByRole("heading", { name: /How easy was it/ })).toHaveCount(0);
  await expect(preview.getByText("This session needs a screen and voice recording.")).toBeVisible();

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

test("Analytics is authenticated, follows Share in navigation, and exports transcripts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=2");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link")).toHaveText(["Earn", "Share", "Analytics"]);
  await expect(navigation.getByRole("link", { name: "Analytics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Transcript report" })).toBeVisible();
  await expect(
    page.getByText("2 of 2 transcripts ready for Palette Pilot.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy report" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download report" })).toBeEnabled();

  const viewRecordings = page.getByRole("link", { name: "View Palette Pilot's recordings" });
  await expect(viewRecordings).toHaveAttribute(
    "href",
    "/recordings?ds-user=user-mateo&ds-recordings=2",
  );

  await expect(page.getByRole("link", { name: /^Recording/ })).toHaveCount(0);
  await expect(page.getByText(/^Recording [12]$/)).toHaveCount(0);
  await expect(page.getByText(/^Preview from /)).toHaveCount(0);
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

  await viewRecordings.click();
  await expect(page).toHaveURL(/\/recordings\?/);
  await expect(page.getByText("Recording 1 of 2", { exact: true })).toBeVisible();
});

test("Analytics exposes report actions and its empty state", async ({ page }) => {
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=1");
  await expect(page.getByRole("button", { name: "Copy report" })).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "View Palette Pilot's recording", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play Recording/ })).toHaveCount(1);
  await expect(page.getByText("Recording 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Preview from /)).toHaveCount(0);

  await page.goto("/analytics?ds-user=user-mateo");
  await expect(
    page.getByText("Your transcript report will appear here when you have a recording.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy report" })).toBeDisabled();
  await expect(page.getByRole("heading", { level: 2, name: "View recordings" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Recording/ })).toHaveCount(0);
});

test("Recording view opens the latest video and browses available recordings", async ({ page }) => {
  await page.goto("/analytics?ds-user=user-mateo&ds-recordings=2");
  await page.getByRole("link", { name: "View Palette Pilot's recordings" }).click();

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
  await expect(
    page.getByRole("region", { name: "Recording transcript", exact: true }),
  ).toBeVisible();
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Earn platform preferences stay saved across visits at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/earn?ds-user=user-avery");

    const dialog = page.getByRole("dialog", {
      name: "What platforms can you reliably access?",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("platform-preferences.png") });

    const websites = dialog.getByRole("checkbox", { name: "Websites" });
    await websites.focus();
    await page.keyboard.press("Space");
    await expect(websites).not.toBeChecked();

    await dialog.getByRole("button", { name: "Save preferences" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Sort by", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Filters", exact: true }).press("Enter");
    await expect(page.getByRole("group", { name: "Choose platforms you can test" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Web", exact: true })).not.toBeChecked();

    await page.reload();
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();

    if (viewport.width === 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("navigation", { name: "Account" })
        .getByRole("button", { name: "Sign out" })
        .click();
    } else {
      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
    }
    if (viewport.width === 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto("/");
    await page.goto("/earn?ds-user=user-avery");
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Web", exact: true })).not.toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("saved-preferences-return-visit.png") });
  });
}

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
  await expect(page.getByRole("button", { name: "Get started" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Share screen" })).toBeDisabled();
  await expect(page.getByText("Prepare to think out loud", { exact: true })).toBeVisible();
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
