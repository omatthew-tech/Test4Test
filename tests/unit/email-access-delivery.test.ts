// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("npm:@supabase/supabase-js@2", () => ({ createClient: vi.fn() }));
const modulePath = "../../supabase/functions/_shared/email-system.ts";
const { sendEmail, renderEmailTemplate } = await import(modulePath);
afterEach(() => vi.unstubAllGlobals());
const env = {
  smtp2goApiKey: "ordinary-key",
  smtp2goAuthLinkApiKey: "untracked-key",
  smtp2goAuthLinkTrackingDisabled: true,
  smtp2goSender: "no-reply@example.test",
};
const link = `https://test4test.io/email-access#token=${"ab".repeat(32)}`;
it("supports a per-message sender without changing other emails", async () => {
  const send = vi.fn().mockImplementation(async () => Response.json({ data: { succeeded: 1 } }));
  vi.stubGlobal("fetch", send);
  const message = { to: "new@example.test", subject: "Hello", textBody: "Hi", htmlBody: "Hi" };
  await sendEmail(env, {
    ...message,
    sender: { name: "Matt @ Test4Test", email: "Matt@Test4Test.io" },
    replyTo: "Matt@Test4Test.io",
  });
  await sendEmail(env, message);
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({
    sender: "Matt @ Test4Test <Matt@Test4Test.io>",
    custom_headers: [{ header: "Reply-To", value: "Matt@Test4Test.io" }],
  });
  expect(JSON.parse(send.mock.calls[1][1].body).sender).toBe("Test4Test <no-reply@example.test>");
});
it("renders the identical credential destination in HTML and plain text, without logging bodies", async () => {
  const rendered = renderEmailTemplate(
    {
      subject_template: "Feedback",
      text_template: "Open: {{feedbackUrl}}",
      html_template: '<a href="{{feedbackUrl}}">View feedback</a>',
    },
    { feedbackUrl: link },
  );
  expect(rendered.textBody).toContain(link);
  expect(rendered.htmlBody).toContain(`href="${link}"`);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: { succeeded: 1, email_id: "sent", echoed_body: link } })),
    );
  vi.stubGlobal("fetch", fetchMock);
  const result = await sendEmail(env, {
    to: "owner@example.test",
    ...rendered,
    containsAuthenticationLink: true,
  });
  expect(fetchMock.mock.calls[0][1].headers["X-Smtp2go-Api-Key"]).toBe("untracked-key");
  expect(JSON.stringify(result)).not.toContain(link);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    text_body: rendered.textBody,
    html_body: rendered.htmlBody,
  });
});
it("fails closed without the untracked key and redacts provider and transport errors", async () => {
  const message = {
    to: "owner@example.test",
    subject: "Feedback",
    textBody: link,
    htmlBody: link,
    containsAuthenticationLink: true,
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(sendEmail({ ...env, smtp2goAuthLinkApiKey: undefined }, message)).rejects.toThrow(
    "Email sign-in delivery failed",
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: link }), { status: 500 }))
    .mockRejectedValueOnce(new Error(link));
  for (let n = 0; n < 2; n++)
    await expect(sendEmail(env, message)).rejects.toThrow(/^Email sign-in delivery failed\.$/);
});
