import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`chat inbox and conversation at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(/https:\/\/[^/]*\.supabase\.co\//, (route) => {
      throw new Error(`Chat fixture contacted Supabase: ${route.request().url()}`);
    });
    await page.goto("/messages?ds-user=user-mateo");
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Conversations", exact: true })
      .getByRole("link")
      .first()
      .click();
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
    }
    await page.goto("/messages?ds-tester=locked");
    await expect(page).toHaveURL(/\/messages/);
    await page
      .getByRole("navigation", { name: "Conversations", exact: true })
      .getByRole("link")
      .first()
      .click();
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
