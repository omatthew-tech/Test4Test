import { expect, it } from "vitest";

// Dynamic path keeps the Deno module's .ts imports out of the browser compiler.
const modulePath = "../../supabase/functions/_shared/chat-email.ts";
const { renderChatEmail, chatExcerpt } = await import(modulePath);
const context = {
  productName: "Example app",
  body: "Thanks for testing!",
  founderSent: true,
  conversationId: "thread-123",
  stage: 0,
};

it("renders exactly the brand, headline, escaped preview and one conversation action", () => {
  const rendered = renderChatEmail(
    { ...context, productName: "App <script>", body: '<img onerror="alert(1)"> & hello' },
    "https://test4test.io",
  );
  const dom = new DOMParser().parseFromString(rendered.htmlBody, "text/html");
  expect(dom.querySelectorAll("script")).toHaveLength(0);
  expect(dom.querySelectorAll("img")).toHaveLength(1);
  expect(dom.querySelectorAll("h1")).toHaveLength(1);
  expect(dom.querySelectorAll("a")).toHaveLength(1);
  expect(dom.querySelectorAll("table table > tbody > tr")).toHaveLength(4);
  expect(dom.querySelector("h1")?.textContent).toBe(
    "The founder of App <script> sent you a message",
  );
  expect(dom.querySelector("a")?.textContent).toBe("View message");
  expect(dom.querySelector("a")?.getAttribute("href")).toBe(
    "https://test4test.io/messages/thread-123",
  );
  expect(rendered.textBody).toContain("Test4Test");
});
it("uses the opposite headline for founder recipients and changes only the reminder subject", () => {
  const reply = renderChatEmail({ ...context, founderSent: false }, "https://test4test.io/");
  expect(reply.subject).toBe("Your tester for Example app sent you a message");
  const initial = renderChatEmail(context, "https://test4test.io");
  const reminder = renderChatEmail({ ...context, stage: 3 }, "https://test4test.io");
  expect(reminder.subject).toBe(`Reminder: ${initial.subject}`);
  expect(reminder.htmlBody.replace(/<title>.*?<\/title>/, "")).toBe(
    initial.htmlBody.replace(/<title>.*?<\/title>/, ""),
  );
});
it("limits Unicode excerpts to 160 characters and normalizes newlines without breaking emoji", () => {
  expect(chatExcerpt("  first\n\nsecond ")).toBe("first second");
  expect(Array.from(chatExcerpt("😀".repeat(180)))).toHaveLength(160);
  expect(chatExcerpt("😀".repeat(180))).toBe(`${"😀".repeat(159)}…`);
  expect(chatExcerpt("x".repeat(160))).toBe("x".repeat(160));
});
