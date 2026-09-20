// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `96000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
let db: PGlite;
let a: string;
let b: string;
const claim = (user: string | null) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
const report = async (action = "report") =>
  (await db.query<{ report: any }>("select public.manage_earn_experiment($1) as report", [action]))
    .rows[0].report;
const publish = (user: string, submission = user) =>
  db.query("insert into submissions(id,user_id) values($1,$2)", [submission, user]);
const summary = async () =>
  (await db.query<any>("select * from public.get_my_earn_visibility_summary()")).rows[0];
const assignments = async () =>
  (await db.query<any>("select * from private.earn_experiment_assignments order by user_id")).rows;
const visit = async (source = "direct_or_unknown", visitId = id(201)) => {
  await db.query("select public.record_earn_visit($1,$2,'earn')", [visitId, source]);
  return visitId;
};
const expose = (variant: string, visitId: string | null = null) =>
  db.query("select public.record_earn_exposure('earn_activation_v1',$1,$2)", [variant, visitId]);
const complete = (user: string, responseId = id(301), approved = true) =>
  db.query(
    "insert into test_responses(id,submission_id,tester_user_id,status,credit_awarded) values($1,$2,$3,$4,$5)",
    [responseId, id(90), user, approved ? "approved" : "flagged", approved],
  );
async function rejects(action: () => Promise<unknown>, message?: string) {
  await db.exec("savepoint expected_error");
  await expect(action()).rejects.toThrow(message);
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default clock_timestamp(), email_confirmed_at timestamptz default clock_timestamp());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key, account_type text default 'founder', status text default 'active', test_back_rate integer default 100);
    create table admin_users(email text primary key, user_id uuid);
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;
    create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.profiles where id=$1 and status='active') $$;
    create function public.get_effective_test_back_rate_for_owner(uuid) returns table(owner_test_back_rate_percent integer) language sql stable as $$ select coalesce((select test_back_rate from public.profiles where id=$1),100) $$;
    create function private.tester_paid_access_counts(uuid) returns table(paid_access_unlocked boolean) language sql stable as $$ select false $$;
    create table submissions(
      id uuid primary key, user_id uuid, product_name text default 'App', product_type text default 'website', product_types text[] default '{website}',
      description text default '', target_audience text default '', instructions text default '', google_play_closed_test_instructions text default '',
      access_url text default '', access_method text default '', access_links jsonb default '{}', requires_recording boolean default true,
      needs_google_play_closed_testers boolean default false, status text default 'live', question_mode text default 'general',
      is_open_for_more_tests boolean default true, estimated_minutes integer default 7, response_count integer default 0,
      last_response_at timestamptz, promoted boolean default false, created_at timestamptz default clock_timestamp(), reward_type text default 'credit'
    );
    create table test_responses(id uuid primary key, submission_id uuid, tester_user_id uuid, status text default 'approved', credit_awarded boolean default true);
    create table feedback_ratings(test_response_id uuid, star_rating smallint);
    create table credit_transactions(user_id uuid, amount integer, type text default 'adjustment');
    create function public.user_has_completed_credited_test(uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.test_responses where tester_user_id=$1 and status='approved' and credit_awarded)
    $$;
    create function public.user_is_google_play_closed_test_pool(uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.submissions where user_id=$1 and status='live' and is_open_for_more_tests and needs_google_play_closed_testers)
    $$;
    create function public.submit_test_response(uuid,jsonb,integer,text,text,uuid,uuid) returns jsonb language plpgsql as $$
    declare rid uuid := gen_random_uuid();
    begin
      insert into public.test_responses values(rid,$1,auth.uid(),case when $3>0 then 'approved' else 'flagged' end,$3>0);
      return jsonb_build_object('responseId',rid,'ok',$3>0,'creditAwarded',$3>0);
    end; $$;
    grant usage on schema auth to authenticated;
    grant select on profiles to authenticated;
  `);
  const selection = await migration(
    "20260827160454_separate_earn_selection_from_link_availability",
  );
  await db.exec(
    selection.slice(
      selection.indexOf("alter table public.submissions"),
      selection.indexOf("create or replace function public.user_is_google_play_closed_test_pool"),
    ),
  );
  await db.exec(await migration("20260919015900_automatically_rank_earn_apps"));
  await db.exec(await migration("20260919022550_earn_first_credit_rank_preview"));
  await db.exec(await migration("20260919173939_earn_activation_experiment"));
  expect((await db.query<any>("select status from private.earn_experiments")).rows[0].status).toBe(
    "draft",
  );
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email,created_at) values('${id(0)}','support@example.com','2020-01-01');
    insert into profiles(id) values('${id(0)}');
    insert into admin_users values('support@example.com','${id(0)}');
  `);
  await claim(id(0));
  await report("start");
  for (let n = 1; n <= 12; n++) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id(n),
      `founder${n}@example.com`,
    ]);
    await db.query("insert into profiles(id) values($1)", [id(n)]);
  }
  const arms = (
    await db.query<any>(
      `select id::text, case when get_byte(decode(md5('earn_activation_v1:'||id::text),'hex'),0)<128 then 'A' else 'B' end as variant from profiles where id<>'${id(0)}' order by id`,
    )
  ).rows;
  a = arms.find((row) => row.variant === "A").id;
  b = arms.find((row) => row.variant === "B").id;
});
afterEach(async () => db.exec("rollback; reset role"));

it("assigns only new eligible founders and keeps the same assignment after selection changes", async () => {
  await publish(a);
  const first = (await assignments())[0];
  await publish(a, id(101));
  expect(await assignments()).toEqual([first]);
  expect(
    (
      await db.query<any>(
        "select count(*)::int as count from submissions where user_id=$1 and is_open_for_more_tests",
        [a],
      )
    ).rows[0].count,
  ).toBe(1);
  await db.query("update auth.users set created_at='2020-01-01' where id=$1", [b]);
  await publish(b);
  await publish(id(0));
  expect(await assignments()).toHaveLength(1);
});

it("excludes testers, paused/unselected apps, prior completions and previously earned credits", async () => {
  await db.query("update profiles set account_type='tester' where id=$1", [id(1)]);
  await publish(id(1));
  await db.query(
    "insert into submissions(id,user_id,status,is_open_for_more_tests) values($1,$1,'paused',false),($2,$2,'live',false)",
    [id(2), id(3)],
  );
  await complete(id(4));
  await publish(id(4));
  await db.query("insert into credit_transactions values($1,1,'earned_test')", [id(5)]);
  await publish(id(5));
  expect(await assignments()).toEqual([]);
});

it("lists A and hides B from other users while giving B a private hypothetical placement", async () => {
  await publish(a);
  await publish(b);
  await claim(id(0));
  const ids = (
    await db.query<any>("select id from public.list_earn_submissions('{website}')")
  ).rows.map((row) => row.id);
  expect(ids).toContain(a);
  expect(ids).not.toContain(b);
  await claim(b);
  expect(await summary()).toMatchObject({
    rank: null,
    listing_locked: true,
    experiment_variant: "B",
    ranked_submission_count: 1,
    would_ranked_submission_count: 2,
  });
  expect((await summary()).would_rank).toBeGreaterThan(0);
  await claim(a);
  expect(await summary()).toMatchObject({
    rank: 1,
    listing_locked: false,
    ranked_submission_count: 1,
    would_rank: 1,
  });
});

it("unlocks on approved credited completion, not adjustments or flagged responses, and stays unlocked after spending", async () => {
  await publish(b);
  await claim(b);
  await db.query("insert into credit_transactions values($1,9,'adjustment')", [b]);
  await complete(b, id(301), false);
  expect((await summary()).listing_locked).toBe(true);
  await db.query("update test_responses set status='approved',credit_awarded=true where id=$1", [
    id(301),
  ]);
  const completion = (await assignments())[0].first_completed_at;
  await db.query("insert into credit_transactions values($1,-9,'adjustment')", [b]);
  await complete(b, id(302));
  expect(await summary()).toMatchObject({
    rank: 1,
    listing_locked: false,
    token_balance: 0,
    has_completed_test: true,
  });
  expect((await assignments())[0].first_completed_at).toEqual(completion);
});

it("records first exposure once, rejects the wrong arm, and does not expose completed users retroactively", async () => {
  await publish(a);
  await publish(b);
  await claim(a);
  await expose("B");
  expect((await assignments()).find((row) => row.user_id === a).first_exposed_at).toBeNull();
  await expose("A", await visit("feedback_email"));
  const first = (await assignments()).find((row) => row.user_id === a);
  await expose("A", await visit("normal_sign_in", id(202)));
  expect((await assignments()).find((row) => row.user_id === a)).toEqual(first);
  await complete(b);
  await claim(b);
  await expose("B");
  expect((await assignments()).find((row) => row.user_id === b).first_exposed_at).toBeNull();
});

it("binds visits to their owner and makes entry attribution immutable", async () => {
  await claim(a);
  await visit("feedback_email");
  await visit("normal_sign_in");
  expect(
    (await db.query<any>("select source from private.earn_experiment_visits")).rows[0].source,
  ).toBe("feedback_email");
  await claim(b);
  await rejects(() => visit(), "another account");
});

it("handles concurrent enrollment and exposure requests without splitting an account", async () => {
  await Promise.all([publish(a, id(401)), publish(a, id(402))]);
  expect(await assignments()).toHaveLength(1);
  await claim(a);
  const visitId = await visit("normal_sign_in");
  await Promise.all([expose("A", visitId), expose("A", visitId)]);
  await claim(id(0));
  expect((await report()).variants.find((row: any) => row.variant === "A").exposed).toBe(1);
});

it("ignores a foreign visit on submission and records the completion as unknown", async () => {
  await claim(a);
  const foreignVisit = await visit("feedback_email");
  await publish(b);
  await claim(b);
  await expose("B");
  await db.query("select public.submit_test_response_with_attribution($1,'{}',60,p_visit_id=>$2)", [
    id(90),
    foreignVisit,
  ]);
  await claim(id(0));
  expect((await report()).sources).toContainEqual({
    variant: "B",
    stage: "completion",
    source: "direct_or_unknown",
    users: 1,
  });
});

it("calculates elapsed time and keeps completions before exposure out of the primary totals", async () => {
  await publish(a);
  await claim(a);
  await expose("A");
  await complete(a);
  await db.query(
    "update private.earn_experiment_assignments set first_exposed_at=first_completed_at-interval '90 seconds' where user_id=$1",
    [a],
  );
  await publish(b);
  await complete(b, id(302));
  await claim(id(0));
  const results = await report();
  expect(results.variants.find((row: any) => row.variant === "A").medianSeconds).toBe(90);
  expect(results.variants.find((row: any) => row.variant === "B")).toMatchObject({
    assigned: 1,
    unexposed: 1,
    exposed: 0,
    completed: 0,
    completionPercent: null,
  });
});

it("attributes the conversion visit atomically and still counts legacy or missing-attribution completions", async () => {
  await publish(a);
  await claim(a);
  await expose("A", await visit("signup_onboarding"));
  const returningVisit = await visit("feedback_email", id(202));
  await db.query("select public.submit_test_response_with_attribution($1,'{}',60,p_visit_id=>$2)", [
    id(90),
    returningVisit,
  ]);
  await claim(id(0));
  const result = await report();
  expect(result.variants.find((row: any) => row.variant === "A")).toMatchObject({
    assigned: 1,
    exposed: 1,
    completed: 1,
    completionPercent: 100,
    notCompleted: 0,
  });
  expect(result.sources).toEqual(
    expect.arrayContaining([
      { variant: "A", stage: "exposure", source: "signup_onboarding", users: 1 },
      { variant: "A", stage: "completion", source: "feedback_email", users: 1 },
    ]),
  );
  expect(result.variants[0].medianSeconds).toBeGreaterThanOrEqual(0);
  await publish(b);
  await claim(b);
  await expose("B");
  await complete(b);
  await claim(id(0));
  expect((await report()).sources).toContainEqual({
    variant: "B",
    stage: "completion",
    source: "direct_or_unknown",
    users: 1,
  });
});

it("retains the submission visit when credit is awarded after moderation", async () => {
  await publish(b);
  await claim(b);
  await expose("B");
  const visitId = await visit("test_back_email");
  const submitted = (
    await db.query<any>(
      "select public.submit_test_response_with_attribution($1,'{}',0,p_visit_id=>$2) as result",
      [id(90), visitId],
    )
  ).rows[0].result;
  expect((await assignments())[0].first_completed_at).toBeNull();
  await db.query("update test_responses set status='approved',credit_awarded=true where id=$1", [
    submitted.responseId,
  ]);
  await claim(id(0));
  expect((await report()).sources).toContainEqual({
    variant: "B",
    stage: "completion",
    source: "test_back_email",
    users: 1,
  });
});

it("pauses only enrollment, resumes with the original cutoff, and freezes totals on End", async () => {
  await publish(b);
  await claim(b);
  await expose("B");
  await claim(id(0));
  const startedAt = (await report("pause")).startedAt;
  await publish(a);
  expect(await assignments()).toHaveLength(1);
  await claim(b);
  expect((await summary()).listing_locked).toBe(true);
  await claim(id(0));
  expect((await report("start")).startedAt).toBe(startedAt);
  const ended = await report("end");
  await complete(b);
  await claim(b);
  expect((await summary()).listing_locked).toBe(false);
  await claim(id(0));
  expect(await report()).toEqual(ended);
  await rejects(() => report("start"), "has ended");
});

it("does not reveal private data or allow non-admin controls", async () => {
  await publish(a);
  await claim(a);
  await db.exec("set role authenticated");
  await rejects(
    () => db.query("select * from private.earn_experiment_assignments"),
    "permission denied",
  );
  await rejects(() => report(), "admin access");
  await rejects(() => db.query("select private.earn_experiment_report()"), "permission denied");
  await rejects(() => visit("not_a_source"));
  await claim(null);
  await rejects(summary, "Sign in");
});

it("keeps moderation, pool, platform, own-app and paid-test filters", async () => {
  await publish(a);
  await claim(a);
  expect((await db.query("select * from public.list_earn_submissions('{website}')")).rows).toEqual(
    [],
  );
  await claim(id(0));
  expect((await db.query("select * from public.list_earn_submissions('{ios}')")).rows).toEqual([]);
  await db.query("update submissions set reward_type='paid' where id=$1", [a]);
  expect((await db.query("select * from public.list_earn_submissions('{website}')")).rows).toEqual(
    [],
  );
  await db.query(
    "update submissions set reward_type='credit',needs_google_play_closed_testers=true where id=$1",
    [a],
  );
  expect((await db.query("select * from public.list_earn_submissions('{website}')")).rows).toEqual(
    [],
  );
  await db.query("update submissions set needs_google_play_closed_testers=false where id=$1", [a]);
  await db.query("update profiles set status='banned' where id=$1", [a]);
  expect((await db.query("select * from public.list_earn_submissions('{website}')")).rows).toEqual(
    [],
  );
});
