// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `94000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const functionSQL = (sql: string, name: string) => {
  const start = sql.search(
    new RegExp(`create (?:or replace )?function ${name.replace(/\./g, "\\.")}\\(`),
  );
  if (start < 0) throw new Error(`Missing function ${name}`);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};
let db: PGlite;
let automaticRanking: string;
let previousRanking: string;
const claim = (user: number | null) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [user === null ? "" : id(user)]);
const summary = async () =>
  (await db.query("select * from get_my_earn_visibility_summary()")).rows[0];
const listedIds = async (platforms = ["website"]) =>
  (
    await db.query<{ id: string }>("select id from list_earn_submissions($1)", [platforms])
  ).rows.map((row) => row.id);

beforeAll(async () => {
  db = new PGlite();
  automaticRanking = await migration("20260919015900_automatically_rank_earn_apps");
  previousRanking = functionSQL(
    await migration("20260918021245_exact_star_ratings"),
    "public.get_my_earn_visibility_summary",
  );
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key, account_type text default 'founder', status text default 'active', test_back_rate integer default 100);
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select coalesce(nullif(current_setting('request.allowed',true),''),'true')='true' $$;
    create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.profiles where id=$1 and status='active') $$;
    create function public.get_effective_test_back_rate_for_owner(uuid) returns table(owner_test_back_rate_percent integer) language sql stable as $$ select coalesce((select test_back_rate from public.profiles where id=$1),100) $$;
    create function private.tester_paid_access_counts(uuid) returns table(paid_access_unlocked boolean) language sql stable as $$ select false $$;
    create table submissions(
      id uuid primary key, user_id uuid, product_name text default 'App', product_type text default 'website', product_types text[] default '{website}',
      description text default '', target_audience text default '', instructions text default '', google_play_closed_test_instructions text default '',
      access_url text default '', access_method text default '', access_links jsonb default '{}', requires_recording boolean default true,
      needs_google_play_closed_testers boolean default false, status text default 'live', question_mode text default 'general',
      is_open_for_more_tests boolean default true, estimated_minutes integer default 7, response_count integer default 0,
      last_response_at timestamptz, promoted boolean default false, created_at timestamptz default '2026-01-01', reward_type text default 'credit'
    );
    create table test_responses(id uuid primary key, submission_id uuid, tester_user_id uuid, status text default 'approved', credit_awarded boolean default true);
    create table feedback_ratings(test_response_id uuid, star_rating smallint);
    create table credit_transactions(user_id uuid, amount integer);
    grant usage on schema auth to anon, authenticated;
    grant select,update on submissions to authenticated;
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
  await db.exec(functionSQL(selection, "public.user_is_google_play_closed_test_pool"));
  await db.exec(
    functionSQL(
      await migration("20260606_earn_first_test_visibility_gate"),
      "public.user_has_completed_credited_test",
    ),
  );
  await db.exec(
    functionSQL(
      await migration("20260820031244_tester_signup_paid_progression"),
      "public.list_earn_submissions",
    ),
  );
  await db.exec(previousRanking);
  await db.exec(automaticRanking);
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`
    begin;
    insert into profiles(id) select ('94000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,9)n;
    insert into submissions(id,user_id,product_name,created_at) values
      ('${id(101)}','${id(1)}','New owner app','2026-01-01'),
      ('${id(102)}','${id(2)}','Another new app','2026-01-02'),
      ('${id(103)}','${id(3)}','Newest app','2026-01-03');
  `);
  await claim(1);
});
afterEach(async () => db.exec("rollback; reset role"));

it("lists and ranks a zero-credit owner with no completions for eligible testers", async () => {
  await db.exec("set role authenticated");
  expect(await summary()).toMatchObject({
    submission_id: id(101),
    has_completed_test: false,
    rank: 3,
    ranked_submission_count: 3,
    would_rank: 3,
    would_ranked_submission_count: 3,
    token_balance: 0,
    test_back_rate_percent: null,
    satisfaction_rate_percent: null,
  });
  expect(await listedIds()).toEqual([id(103), id(102)]);
  await claim(2);
  expect(await listedIds()).toContain(id(101));
  expect(await listedIds()).not.toContain(id(102));
});

it("gives existing apps ranks on migration without republishing or backfilling", async () => {
  await db.exec(previousRanking);
  expect(await summary()).toMatchObject({ rank: null, has_completed_test: false });
  const before = (await db.query("select * from submissions order by id")).rows;
  await db.exec(automaticRanking);
  expect(await summary()).toMatchObject({ rank: 3, would_rank: 3, has_completed_test: false });
  expect((await db.query("select * from submissions order by id")).rows).toEqual(before);
  expect((await db.query("select * from credit_transactions")).rows).toEqual([]);
});

it("preserves platform, pool, moderation, selection and previously-tested filters", async () => {
  await db.exec(`
    update profiles set status='banned' where id='${id(9)}';
    insert into submissions(id,user_id,status,product_types,needs_google_play_closed_testers,is_open_for_more_tests) values
      ('${id(104)}','${id(4)}','paused','{website}',false,false),
      ('${id(105)}','${id(5)}','pending_verification','{website}',false,false),
      ('${id(106)}','${id(6)}','live','{website}',false,false),
      ('${id(107)}','${id(7)}','live','{ios}',false,true),
      ('${id(108)}','${id(8)}','live','{android}',true,true),
      ('${id(109)}','${id(9)}','live','{website}',false,true);
  `);
  expect(await listedIds()).toEqual([id(103), id(102)]);
  expect(await listedIds(["ios"])).toEqual([id(107)]);
  expect(await listedIds(["android"])).toEqual([]);
  expect(await listedIds([])).toEqual([]);
  expect(await summary()).toMatchObject({
    ranked_submission_count: 4,
    would_ranked_submission_count: 4,
  });
  await db.exec(
    `insert into test_responses(id,submission_id,tester_user_id) values('${id(201)}','${id(102)}','${id(1)}')`,
  );
  expect(await listedIds()).not.toContain(id(102));
  await claim(8);
  expect(await summary()).toMatchObject({ rank: 1, ranked_submission_count: 1 });
  expect(await listedIds(["website", "android"])).toEqual([]);
});

it("keeps one selected app per owner when a new app is published or selected", async () => {
  await db.exec(
    `insert into submissions(id,user_id,created_at) values('${id(110)}','${id(1)}','2026-01-04')`,
  );
  expect(await summary()).toMatchObject({
    submission_id: id(110),
    rank: 1,
    has_completed_test: false,
  });
  expect(
    (
      await db.query("select id from submissions where user_id=$1 and is_open_for_more_tests", [
        id(1),
      ])
    ).rows,
  ).toEqual([{ id: id(110) }]);
  await db.query("select activate_earn_submission($1)", [id(101)]);
  expect(await summary()).toMatchObject({
    submission_id: id(101),
    rank: 3,
    has_completed_test: false,
  });
  expect((await db.query("select status from submissions where user_id=$1", [id(1)])).rows).toEqual(
    [{ status: "live" }, { status: "live" }],
  );
});

it("retains credit, promotion, exact-star reputation and response-count ranking priorities", async () => {
  await db.exec(
    `insert into credit_transactions values('${id(1)}',1); update submissions set promoted=true where id='${id(102)}'`,
  );
  expect(await summary()).toMatchObject({ rank: 1, token_balance: 1, has_completed_test: false });
  await db.exec(`update credit_transactions set amount=0`);
  expect(await summary()).toMatchObject({ rank: 3 });
  await claim(2);
  expect(await summary()).toMatchObject({ rank: 1 });
  await db.exec(`
    update submissions set promoted=false;
    insert into test_responses(id,submission_id,tester_user_id) values
      ('${id(201)}','${id(103)}','${id(1)}'), ('${id(202)}','${id(103)}','${id(2)}');
    insert into feedback_ratings values('${id(201)}',2),('${id(202)}',4);
  `);
  expect(await summary()).toMatchObject({ rank: 2, satisfaction_rate_percent: 80 });
  await claim(1);
  expect(await summary()).toMatchObject({
    rank: 3,
    satisfaction_rate_percent: 40,
    has_completed_test: true,
  });
  await db.exec(`update profiles set test_back_rate=0 where id='${id(3)}'`);
  expect(await summary()).toMatchObject({ rank: 2 });
  await db.exec(
    `delete from feedback_ratings; update profiles set test_back_rate=100; update submissions set response_count=5 where id='${id(103)}'`,
  );
  expect(await summary()).toMatchObject({ rank: 2 });
  await db.exec(`update submissions set created_at='2026-01-05' where id='${id(101)}'`);
  expect(await summary()).toMatchObject({ rank: 1, would_rank: 1, token_balance: 0 });
});

it("keeps absent or ineligible apps unranked and retains authentication checks", async () => {
  await db.exec(`update submissions set is_open_for_more_tests=false where user_id='${id(1)}'`);
  expect(await summary()).toMatchObject({
    submission_id: null,
    rank: null,
    would_rank: null,
    ranked_submission_count: 0,
  });
  await claim(null);
  await expect(summary()).rejects.toThrow("Sign in to view your Earn visibility summary.");
});

it("retains the account-access guard", async () => {
  await db.exec("select set_config('request.allowed','false',false)");
  await expect(summary()).rejects.toThrow("Your account cannot access Test4Test right now.");
});

describe("first-credit rank preview", () => {
  beforeEach(async () => {
    await db.exec(await migration("20260919022550_earn_first_credit_rank_preview"));
  });

  it("projects an extra credit without changing balances or the current rank", async () => {
    await db.exec("set role authenticated");
    expect(await summary()).toMatchObject({
      rank: 3,
      rank_after_one_credit: 1,
      token_balance: 0,
      has_completed_test: false,
    });
    await db.exec("reset role");
    expect((await db.query("select * from credit_transactions")).rows).toEqual([]);
    await db.exec(`insert into credit_transactions values('${id(1)}',1)`);
    expect(await summary()).toMatchObject({ rank: 1, token_balance: 1 });
  });

  it.each([
    ["promotion", `update submissions set promoted=true where id='${id(102)}'`],
    ["reputation", `update profiles set test_back_rate=0 where id='${id(1)}'`],
    ["response count", `update submissions set response_count=10 where id='${id(101)}'`],
    ["creation date", "select 1"],
    ["ID", "update submissions set created_at='2026-01-01'"],
  ])("keeps %s tie-breakers when the extra credit ties another owner", async (_, setup) => {
    await db.exec(`insert into credit_transactions values('${id(2)}',1),('${id(3)}',3)`);
    await db.exec(setup);
    expect(await summary()).toMatchObject({ rank: 3, rank_after_one_credit: 3 });
    await db.exec(`insert into credit_transactions values('${id(1)}',1)`);
    expect(await summary()).toMatchObject({ rank: 3 });
  });

  it("includes existing credits and respects the same pool and eligibility filters", async () => {
    await db.exec(`
      insert into credit_transactions values('${id(1)}',2),('${id(2)}',2),('${id(3)}',3);
      insert into submissions(id,user_id,needs_google_play_closed_testers,status) values
        ('${id(104)}','${id(4)}',true,'live'), ('${id(105)}','${id(5)}',false,'paused');
      insert into credit_transactions values('${id(4)}',100),('${id(5)}',100);
    `);
    expect(await summary()).toMatchObject({ rank: 3, rank_after_one_credit: 2 });
    await db.exec(`insert into credit_transactions values('${id(1)}',1)`);
    expect(await summary()).toMatchObject({ rank: 2 });
  });

  it("returns zero movement at the top and no projection for an unranked app", async () => {
    await claim(3);
    expect(await summary()).toMatchObject({ rank: 1, rank_after_one_credit: 1 });
    await db.exec(`update submissions set is_open_for_more_tests=false where user_id='${id(3)}'`);
    expect(await summary()).toMatchObject({ rank: null, rank_after_one_credit: null });
  });

  it("hides the preview only after an approved credited test, even with zero remaining credits", async () => {
    await db.exec(`insert into test_responses(id,submission_id,tester_user_id,status,credit_awarded)
      values('${id(201)}','${id(102)}','${id(1)}','pending',false)`);
    expect(await summary()).toMatchObject({ has_completed_test: false, rank_after_one_credit: 1 });
    await db.exec("update test_responses set status='approved'");
    expect(await summary()).toMatchObject({ has_completed_test: false, rank_after_one_credit: 1 });
    await db.exec("update test_responses set credit_awarded=true");
    expect(await summary()).toMatchObject({
      has_completed_test: true,
      token_balance: 0,
      rank_after_one_credit: null,
    });
  });

  it("restricts the preview to the authenticated current user", async () => {
    await db.exec("set role authenticated");
    await claim(2);
    expect(await summary()).toMatchObject({ submission_id: id(102), rank: 2 });
    await claim(null);
    await expect(summary()).rejects.toThrow("Sign in to view your Earn visibility summary.");
  });

  it("does not grant anonymous access to either function", async () => {
    const result = await db.query<{ allowed: boolean }>(`select
      has_function_privilege('anon','public.get_my_earn_visibility_summary()','execute') or
      has_function_privilege('anon','private.get_my_earn_visibility_summary_with_preview()','execute') as allowed`);
    expect(result.rows).toEqual([{ allowed: false }]);
  });
});
