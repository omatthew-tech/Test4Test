import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`My Reviews starts a new conversation at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Chat fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
    // The unrated card points to Avery's real fixture response for Mateo's app.
    const messageLink = page.getByRole("link", { name: "Message about Unrated recording" });
    await expect(messageLink).toHaveAttribute(
      "href",
      "/messages?response=response-palette-1&ds-user=user-avery",
    );
    await messageLink.focus();
    await page.keyboard.press("Enter");
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeVisible();
    await expect(page.getByText("Start a conversation about Palette Pilot.")).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Mateo Cruz$/ })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`my-reviews-composer-${viewport.width}.png`),
    });

    await composer.fill("I have a follow-up about the app I reviewed.");
    await composer.press("Tab");
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/messages\/[^/?]+\?ds-user=user-avery$/);
    const conversationPath = new URL(page.url()).pathname;
    const history = page.getByRole("region", { name: "Message history" });
    await expect(
      history.getByText("I have a follow-up about the app I reviewed.", { exact: true }),
    ).toHaveCount(1);
    await expect(composer).toHaveValue("");
    await page.reload();
    await expect(history).toContainText("I have a follow-up about the app I reviewed.");

    await page.goto(`${conversationPath}?ds-user=user-mateo`);
    await expect(history).toContainText("I have a follow-up about the app I reviewed.");
    await composer.fill("Thanks for reviewing! Happy to help.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(history).toContainText("Thanks for reviewing! Happy to help.");

    await page.goto("/submissions?ds-user=user-avery&ds-star-ratings=1");
    await messageLink.click();
    await expect(
      history.getByText("I have a follow-up about the app I reviewed.", { exact: true }),
    ).toHaveCount(1);
    await expect(
      history.getByText("Thanks for reviewing! Happy to help.", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole("navigation", { name: "Conversations", exact: true, includeHidden: true })
        .getByRole("link", { includeHidden: true })
        .filter({ hasText: "Palette Pilot" }),
    ).toHaveCount(1);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`my-reviews-conversation-${viewport.width}.png`),
      fullPage: true,
    });
  });

  test(`chat inbox and conversation at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Chat fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/messages?ds-user=user-mateo");
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toHaveClass(
      "ds-sr-only",
    );
    await expect(page).toHaveURL(
      /\/messages\/demo-submission-palette-user-avery\?ds-user=user-mateo$/,
    );
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeVisible();
    await composer.fill("Thanks for your feedback!\nCan you tell me more about the first screen?");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("region", { name: "Message history" })).toContainText(
      "Can you tell me more about the first screen?",
    );
    await expect(composer).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("region", { name: "Message history" })).toContainText(
      "Thanks for your feedback!",
    );
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`chat-${viewport.width}.png`),
      fullPage: true,
    });
    if (viewport.width === 390) {
      await page.getByRole("link", { name: "Back to messages" }).click();
      await expect(
        page.getByRole("navigation", { name: "Conversations", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("navigation", { name: "Conversations", exact: true })
        .getByRole("link")
        .first()
        .click();
      await expect(composer).toBeVisible();
    }
    await page.goto("/messages?ds-tester=locked");
    await expect(page).toHaveURL(/\/messages\/[^/?]+\?ds-tester=locked$/);
    await composer.fill("I found the navigation easy to use.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("region", { name: "Message history" })).toContainText(
      "I found the navigation easy to use.",
    );
  });

  test(`chat email at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const rendererPath = "../../supabase/functions/_shared/chat-email.ts";
    const { renderChatEmail } = await import(rendererPath);
    const markup = renderChatEmail(
      {
        productName: "MastoMetrics",
        founderSent: true,
        conversationId: "preview",
        stage: 0,
        body: "Thanks for testing MastoMetrics. Your feedback on the first screen was helpful. Could you tell me a little more about what you expected to see when you opened the analytics page?",
      },
      "http://127.0.0.1:4173",
    ).htmlBody;
    await page.goto("/");
    await page.setContent(markup);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("The founder of");
    await expect(page.getByRole("link", { name: "View message" })).toBeVisible();
    expect(
      (await page.getByRole("link", { name: "View message" }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (violation) => violation.id !== "region",
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`chat-email-${viewport.width}.png`),
      fullPage: true,
    });
  });
}

test("chat deep link preserves its destination through sign-in", async ({ page }) => {
  await page.goto("/messages/not-a-member");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fmessages%2Fnot-a-member/);
});
