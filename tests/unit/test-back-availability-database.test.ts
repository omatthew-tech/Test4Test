// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `97000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
let db: PGlite;
const rate = async () =>
  (
    await db.query<{
      included_inbound_tester_count: number;
      reciprocated_inbound_tester_count: number;
      owner_test_back_rate_percent: number;
    }>("select * from public.get_effective_test_back_rate_for_owner($1)", [id(1)])
  ).rows[0];
const transition = async (tester = 3) =>
  (
    await db.query<{ current_test_back_rate_percent: number; new_test_back_rate_percent: number }>(
      "select * from public.get_test_back_rate_transition($1,$2)",
      [id(1), id(tester)],
    )
  ).rows[0];
const targets = async (tester = 3) =>
  (
    await db.query<{ submission_id: string }>(
      "select * from public.find_test_back_target_submission($1,$2)",
      [id(tester), id(1)],
    )
  ).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema private; create schema auth;
    create table profiles(id uuid primary key, account_type text default 'founder', ban_status text default 'clear', locked boolean default false, paid boolean default false);
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select '${id(1)}'::uuid $$;
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select true $$;
    create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select coalesce((select ban_status='clear' from public.profiles where id=$1),false) $$;
    create function private.earn_listing_locked(uuid) returns boolean language sql stable as $$ select coalesce((select locked from public.profiles where id=$1),false) $$;
    create function private.tester_paid_access_counts(uuid) returns table(paid_access_unlocked boolean) language sql stable as $$ select coalesce((select paid from public.profiles where id=$1),false) $$;
    create table submissions(
      id uuid primary key, user_id uuid, product_name text default 'App', product_type text default 'website', product_types text[] default '{website}',
      description text default '', target_audience text default '', instructions text default '', google_play_closed_test_instructions text default '',
      access_url text default '', access_method text default '', access_links jsonb default '{}', requires_recording boolean default true,
      needs_google_play_closed_testers boolean default false, status text default 'live', question_mode text default 'general',
      is_open_for_more_tests boolean default true, estimated_minutes integer default 7, response_count integer default 0,
      last_response_at timestamptz, promoted boolean default false, created_at timestamptz default now(), reward_type text default 'credit'
    );
    create table test_responses(id uuid primary key, submission_id uuid, tester_user_id uuid, status text default 'approved', credit_awarded boolean default true);
    create table test_back_reminder_sequences(owner_user_id uuid, tester_user_id uuid, affects_test_back_rate boolean default false);
    create table submission_reports(submission_id uuid, reporter_user_id uuid, status text);
    create function public.user_is_google_play_closed_test_pool(uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.submissions where user_id=$1 and status='live' and is_open_for_more_tests and needs_google_play_closed_testers)
    $$;
  `);
  const earn = await migration("20260919173939_earn_activation_experiment");
  const start = earn.indexOf("create or replace function public.list_earn_submissions");
  await db.exec(earn.slice(start, earn.indexOf("$$;", start) + 3));
  await db.exec(await migration("20260928000553_available_test_back_rates"));
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`begin;
    insert into profiles(id) values ('${id(1)}'),('${id(2)}'),('${id(3)}');
    insert into auth.users(id) values ('${id(1)}');
    insert into submissions(id,user_id) values ('${id(101)}','${id(1)}'),('${id(102)}','${id(2)}'),('${id(103)}','${id(3)}');
    insert into test_responses(id,submission_id,tester_user_id) values
      ('${id(201)}','${id(101)}','${id(2)}'),
      ('${id(202)}','${id(101)}','${id(3)}'),
      ('${id(203)}','${id(102)}','${id(1)}');
    insert into test_back_reminder_sequences values ('${id(1)}','${id(3)}',true);
  `);
});
afterEach(async () => {
  await db.exec("rollback");
});

it("counts completed and available overdue testers once, with an unchanged preview", async () => {
  await db.exec(
    `insert into test_responses values ('${id(204)}','${id(101)}','${id(3)}','approved',true)`,
  );
  expect(await rate()).toMatchObject({
    included_inbound_tester_count: 2,
    reciprocated_inbound_tester_count: 1,
    owner_test_back_rate_percent: 50,
  });
  expect(await transition()).toEqual({
    current_test_back_rate_percent: 50,
    new_test_back_rate_percent: 50,
  });
});

const unavailableCases = [
  ["paused", `update submissions set status='paused' where id='${id(103)}'`],
  ["closed", `update submissions set is_open_for_more_tests=false where id='${id(103)}'`],
  ["missing", `delete from submissions where id='${id(103)}'`],
  ["restricted owner", `update profiles set ban_status='banned' where id='${id(3)}'`],
  ["missing owner", `delete from profiles where id='${id(3)}'`],
  ["locked listing", `update profiles set locked=true where id='${id(3)}'`],
  [
    "different pool",
    `update submissions set needs_google_play_closed_testers=true where id='${id(103)}'`,
  ],
  ["different reward", `update submissions set reward_type='paid' where id='${id(103)}'`],
  [
    "existing uncredited response",
    `insert into test_responses values ('${id(204)}','${id(103)}','${id(1)}','flagged',false)`,
  ],
  ["pending report", `insert into submission_reports values ('${id(103)}','${id(1)}','pending')`],
  [
    "confirmed report",
    `insert into submission_reports values ('${id(103)}','${id(1)}','confirmed')`,
  ],
] as const;

it.each(unavailableCases)(
  "excludes %s targets from both current and projected rates",
  async (_name, sql) => {
    await db.exec(sql);
    expect(await targets()).toEqual([]);
    expect(await rate()).toMatchObject({
      included_inbound_tester_count: 1,
      reciprocated_inbound_tester_count: 1,
      owner_test_back_rate_percent: 100,
    });
    expect(await transition()).toEqual({
      current_test_back_rate_percent: 100,
      new_test_back_rate_percent: 100,
    });
    expect(
      (await db.query("select affects_test_back_rate from test_back_reminder_sequences")).rows,
    ).toEqual([{ affects_test_back_rate: true }]);
  },
);

it.each(unavailableCases)("agrees with Earn's eligible list for %s", async (_name, sql) => {
  await db.exec(sql);
  const earnTargets = (
    await db.query<{ id: string }>(`
    select e.id from public.list_earn_submissions(array['website','ios','android']) e
    where e.user_id='${id(3)}' and not exists (
      select 1 from submission_reports r where r.submission_id=e.id
        and r.reporter_user_id='${id(1)}' and r.status in ('pending','confirmed')
    )
  `)
  ).rows;
  expect(earnTargets.map((row) => row.id)).toEqual(
    (await targets()).map((row) => row.submission_id),
  );
});

it("restores overdue counting when a paused test reopens without resetting grace history", async () => {
  await db.exec(`update submissions set status='paused' where id='${id(103)}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(100);
  await db.exec(`update submissions set status='live' where id='${id(103)}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
});

it("preserves the grace period and projects the final reminder using eligible targets", async () => {
  await db.exec("update test_back_reminder_sequences set affects_test_back_rate=false");
  expect((await rate()).owner_test_back_rate_percent).toBe(100);
  expect(await transition()).toEqual({
    current_test_back_rate_percent: 100,
    new_test_back_rate_percent: 50,
  });
  await db.exec(`update submissions set status='paused' where id='${id(103)}'`);
  expect(await transition()).toEqual({
    current_test_back_rate_percent: 100,
    new_test_back_rate_percent: 100,
  });
});

it("resumes counting after a report is dismissed and ignores another user's reports", async () => {
  await db.exec(`insert into submission_reports values ('${id(103)}','${id(1)}','pending')`);
  expect((await rate()).owner_test_back_rate_percent).toBe(100);
  await db.exec("update submission_reports set status='dismissed'");
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
  await db.exec(`insert into submission_reports values ('${id(103)}','${id(2)}','confirmed')`);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
});

it("keeps completed exchanges credited when the app closes or its owner is restricted", async () => {
  await db.exec(`update submissions set status='paused' where id='${id(102)}';
    update profiles set ban_status='banned' where id='${id(2)}'`);
  expect(await rate()).toMatchObject({
    included_inbound_tester_count: 2,
    reciprocated_inbound_tester_count: 1,
    owner_test_back_rate_percent: 50,
  });
  expect(await transition(2)).toEqual({
    current_test_back_rate_percent: 50,
    new_test_back_rate_percent: 50,
  });
});

it("counts an outstanding tester if another eligible submission is available", async () => {
  await db.exec(`insert into submission_reports values ('${id(103)}','${id(1)}','confirmed');
    insert into submissions(id,user_id) values ('${id(104)}','${id(3)}')`);
  expect(await targets()).toEqual([expect.objectContaining({ submission_id: id(104) })]);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
});

it("ignores personal platform filters and supports legacy product_type fallback", async () => {
  await db.exec(`update auth.users set raw_user_meta_data='{"earn_platform_preferences":["website"]}';
    update submissions set product_type='android',product_types=null where id='${id(103)}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
  await db.exec(`update auth.users set raw_user_meta_data='{"earn_platform_preferences":[]}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
});

it("matches the tester's reward eligibility when paid access is unlocked", async () => {
  await db.exec(`update profiles set account_type='tester',paid=true where id='${id(1)}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(100);
  await db.exec(`update submissions set reward_type='paid' where id='${id(103)}'`);
  expect((await rate()).owner_test_back_rate_percent).toBe(50);
});

it("does not count unapproved inbound feedback and defaults to 100 when nothing is counted", async () => {
  await db.exec(
    `update test_responses set status='flagged',credit_awarded=false where submission_id='${id(101)}'`,
  );
  expect(await rate()).toMatchObject({
    included_inbound_tester_count: 0,
    reciprocated_inbound_tester_count: 0,
    owner_test_back_rate_percent: 100,
  });
  await db.exec("delete from test_responses");
  expect((await rate()).owner_test_back_rate_percent).toBe(100);
});

it("reproduces the account regression: 26 completed and four unavailable become 100%", async () => {
  await db.exec(`
    delete from test_responses; delete from test_back_reminder_sequences;
    insert into profiles(id) select md5(n::text)::uuid from generate_series(10,39)n;
    insert into submissions(id,user_id) select md5(('app'||n)::text)::uuid,md5(n::text)::uuid from generate_series(10,39)n;
    insert into test_responses select md5(('in'||n)::text)::uuid,'${id(101)}',md5(n::text)::uuid,'approved',true from generate_series(10,39)n;
    insert into test_responses select md5(('out'||n)::text)::uuid,md5(('app'||n)::text)::uuid,'${id(1)}','approved',true from generate_series(10,35)n;
    insert into test_back_reminder_sequences select '${id(1)}',md5(n::text)::uuid,true from generate_series(36,39)n;
    update submissions set status='paused' where user_id in (md5('36')::uuid,md5('37')::uuid);
    insert into submission_reports values (md5('app38')::uuid,'${id(1)}','confirmed');
    update profiles set ban_status='banned' where id=md5('39')::uuid;
  `);
  expect(await rate()).toMatchObject({
    included_inbound_tester_count: 26,
    reciprocated_inbound_tester_count: 26,
    owner_test_back_rate_percent: 100,
  });
});
