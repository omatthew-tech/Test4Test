import { handleReport } from "./index.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function harness(
  stars: number | null,
  options: { owner?: boolean; pending?: boolean; changed?: boolean } = {},
) {
  let pending = options.pending ?? false;
  let claims = 0;
  const notifications: string[] = [];
  const rows: Record<string, unknown> = {
    test_responses: {
      id: "response",
      submission_id: "app",
      tester_user_id: options.owner ? "other" : "tester",
      question_set_version_id: "questions",
      answers: [],
    },
    submissions: { id: "app", user_id: "founder", product_name: "Example", status: "paused" },
    feedback_ratings: stars === null ? null : { star_rating: stars },
    question_set_versions: { questions: [] },
    profiles: { display_name: "Tester" },
  };
  const client = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "tester", email: "tester@example.test" } },
          error: null,
        }),
    },
    from: (table: string) => {
      const result = () =>
        Promise.resolve({
          data:
            table === "feedback_rating_reports"
              ? pending
                ? { status: "pending" }
                : null
              : rows[table],
          error: null,
        });
      const chain = { select: () => chain, eq: () => chain, single: result, maybeSingle: result };
      return chain;
    },
    rpc: (_name: string, args: Record<string, unknown>) => {
      assert(args.p_expected_stars === stars);
      claims++;
      if (options.changed)
        return Promise.resolve({ data: null, error: { message: "This rating has changed." } });
      const claimed = !pending;
      pending = true;
      return Promise.resolve({ data: { claimed, reportId: "report" }, error: null });
    },
  };
  const makeClient = (() => client) as unknown as NonNullable<Parameters<typeof handleReport>[1]>;
  const send: typeof fetch = (_url, init) => {
    assert(pending, "Report must be saved before notification");
    notifications.push(String(init?.body));
    return Promise.resolve(Response.json({ data: { succeeded: 1 } }));
  };
  const run = () =>
    handleReport(
      new Request("https://function.example.test", {
        method: "POST",
        headers: { Authorization: "Bearer fake-test-token" },
        body: JSON.stringify({ responseId: "response", message: "Please review" }),
      }),
      makeClient,
      send,
    );
  return { run, notifications, claimCount: () => claims };
}

for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SMTP2GO_API_KEY", "SMTP2GO_SENDER"])
  Deno.env.set(key, key === "SUPABASE_URL" ? "https://example.test" : "test-fixture");

for (const stars of [1, 2, 3, 4]) {
  Deno.test(`reports ${stars} stars exactly once even for a closed test`, async () => {
    const test = harness(stars);
    assert((await test.run()).status === 200);
    assert((await test.run()).status === 200);
    assert(test.notifications.length === 1);
    assert(test.notifications[0].includes(`${stars}-star`));
    assert(test.claimCount() === 1);
  });
}

for (const stars of [5, null, 0, 6, 2.5]) {
  Deno.test(`rejects non-reportable rating ${stars}`, async () => {
    const test = harness(stars);
    assert((await test.run()).status === 400);
    assert(test.notifications.length === 0);
    assert(test.claimCount() === 0);
  });
}

Deno.test("rejects another tester's response", async () => {
  const test = harness(3, { owner: true });
  assert((await test.run()).status === 403);
  assert(test.notifications.length === 0);
});
Deno.test("does not resend pending reports", async () => {
  const test = harness(4, { pending: true });
  assert((await test.run()).status === 200);
  assert(test.notifications.length === 0);
});
Deno.test("rating changes at the database claim prevent notification", async () => {
  const test = harness(4, { changed: true });
  assert((await test.run()).status === 409);
  assert(test.notifications.length === 0);
});
