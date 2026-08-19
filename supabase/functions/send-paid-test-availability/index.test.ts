import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { logEmailDelivery, renderEmailTemplate } from "../_shared/email-system.ts";
import { handlePaidTestAvailabilityRequest, sendWithRetry } from "./index.ts";

Deno.test("paid-test worker rejects requests without the internal secret", async () => {
  const previousSecret = Deno.env.get("PAID_TEST_NOTIFICATION_SECRET");
  Deno.env.set("PAID_TEST_NOTIFICATION_SECRET", "expected-secret");

  try {
    const response = await handlePaidTestAvailabilityRequest(
      new Request("http://localhost/functions/v1/send-paid-test-availability", {
        method: "POST",
        headers: { "x-paid-test-secret": "wrong-secret" },
        body: "{}",
      }),
    );

    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: "Unauthorized." });
  } finally {
    if (previousSecret === undefined) {
      Deno.env.delete("PAID_TEST_NOTIFICATION_SECRET");
    } else {
      Deno.env.set("PAID_TEST_NOTIFICATION_SECRET", previousSecret);
    }
  }
});

Deno.test("paid-test template renders and escapes tester-facing values", () => {
  const rendered = renderEmailTemplate(
    {
      key: "paid_test_available",
      subject_template: "A paid test for {{ productName }}",
      text_template: "Hi {{ firstName }}, open {{ earnUrl }}",
      html_template: "<p>Hi {{ firstName }}: {{ productName }}</p>",
    },
    {
      firstName: "Avery <Tester>",
      productName: "Research & Design",
      earnUrl: "https://test4test.io/earn",
    },
  );

  assertEquals(rendered.subject, "A paid test for Research & Design");
  assertStringIncludes(rendered.textBody, "Avery <Tester>");
  assertStringIncludes(rendered.htmlBody, "Avery &lt;Tester&gt;");
  assertStringIncludes(rendered.htmlBody, "Research &amp; Design");
});

Deno.test("paid-test delivery retries transient failures and returns the provider id", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const delivery = await sendWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary SMTP failure");
      return { providerMessageId: "provider-123" };
    },
    2,
    async (milliseconds) => {
      delays.push(milliseconds);
    },
  );

  assertEquals(attempts, 3);
  assertEquals(delays, [250, 750]);
  assertEquals(delivery.providerMessageId, "provider-123");
});

Deno.test("paid-test delivery surfaces a final retry failure", async () => {
  await assertRejects(
    () =>
      sendWithRetry(
        async () => {
          throw new Error("permanent failure");
        },
        1,
        async () => undefined,
      ),
    Error,
    "permanent failure",
  );
});

Deno.test("paid-test delivery writes the shared delivery log contract", async () => {
  const inserted: unknown[] = [];
  const admin = {
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        inserted.push({ table, payload });
        return { error: null };
      },
    }),
  };

  await logEmailDelivery(admin as never, {
    templateKey: "paid_test_available",
    recipientUserId: "tester-user",
    recipientEmail: "tester@example.com",
    relatedSubmissionId: "paid-submission",
    subject: "A paid test is available",
    status: "sent",
    providerMessageId: "provider-123",
    metadata: { queueId: "queue-123", attemptCount: 1 },
  });

  assertEquals(inserted.length, 1);
  assertEquals((inserted[0] as { table: string }).table, "email_delivery_logs");
});
