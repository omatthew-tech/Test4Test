// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

it("optimized RLS returns the same rows for owners, testers, unrelated users, banned users and anonymous visitors", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.current_user_has_app_access() returns boolean language sql stable as $$ select coalesce(current_setting('request.allowed',true),'true')='true' $$;
      grant usage on schema auth to authenticated,anon;
      create table submissions(id uuid primary key,user_id uuid,created_at timestamptz default now());
      create table test_responses(id uuid primary key,submission_id uuid,tester_user_id uuid,submitted_at timestamptz default now());
      create table credit_transactions(id uuid primary key,user_id uuid,created_at timestamptz default now());
      create table feedback_ratings(id uuid primary key,test_response_id uuid,rated_by_user_id uuid);
      grant select on submissions,test_responses,credit_transactions,feedback_ratings to authenticated,anon;
      alter table test_responses enable row level security;
      alter table credit_transactions enable row level security;
      alter table feedback_ratings enable row level security;
      insert into submissions select md5(('app'||n)::text)::uuid,md5(n::text)::uuid,now() from generate_series(1,3)n;
      insert into test_responses select md5(('response'||n)::text)::uuid,md5(('app'||n)::text)::uuid,md5((n+1)::text)::uuid,now() from generate_series(1,3)n;
      insert into credit_transactions select md5(('credit'||n)::text)::uuid,md5(n::text)::uuid,now() from generate_series(1,3)n;
      insert into feedback_ratings select md5(('rating'||n)::text)::uuid,md5(('response'||n)::text)::uuid,md5(n::text)::uuid from generate_series(1,3)n;
    `);
    const old = await migration("20260404_profile_ban_enforcement");
    for (const name of [
      "responses_select_related",
      "credit_transactions_select_own",
      "feedback_ratings_select_related",
    ]) {
      const start = old.indexOf(`create policy "${name}"`);
      await db.exec(old.slice(start, old.indexOf(";", start) + 1));
    }
    const readMatrix = async () => {
      const matrix = [];
      for (const user of [1, 2, 3, 9, null])
        for (const allowed of [true, false]) {
          await db.query(
            "select set_config('request.jwt.claim.sub',coalesce(md5($1),'') ,false),set_config('request.allowed',$2,false)",
            [user?.toString() ?? null, String(allowed)],
          );
          await db.exec(`set role ${user ? "authenticated" : "anon"}`);
          const rows = [];
          for (const table of ["test_responses", "credit_transactions", "feedback_ratings"])
            rows.push((await db.query(`select id from ${table} order by id`)).rows);
          matrix.push(rows);
          await db.exec("reset role");
        }
      return matrix;
    };
    const before = await readMatrix();
    await db.exec(await migration("20260910210441_performance_read_paths"));
    expect(await readMatrix()).toEqual(before);
    const indexes = (
      await db.query<{ indexname: string }>(
        "select indexname from pg_indexes where schemaname='public'",
      )
    ).rows.map((row) => row.indexname);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "credit_transactions_user_created_idx",
        "test_responses_tester_submitted_idx",
        "submissions_owner_created_idx",
        "feedback_ratings_rater_idx",
      ]),
    );
  } finally {
    await db.close();
  }
}, 30_000);

it("grouped homepage metrics preserve ranking, defaults, eligibility and six-card limit", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table submissions(id uuid primary key,user_id uuid,product_name text,product_types text[],product_type text,description text,promoted boolean,response_count integer,created_at timestamptz,status text,is_open_for_more_tests boolean,reward_type text,needs_google_play_closed_testers boolean);
      create table credit_transactions(user_id uuid,amount integer);
      create table test_responses(id uuid primary key,tester_user_id uuid,status text,credit_awarded boolean,submission_id uuid);
      create table feedback_ratings(test_response_id uuid,rating_value text);
      create table test_back_reminder_sequences(owner_user_id uuid,tester_user_id uuid,affects_test_back_rate boolean);
      create function profile_is_clear(uuid) returns boolean language sql stable as $$ select $1 <> md5('13')::uuid $$;
      insert into submissions select md5(('app'||n)::text)::uuid,md5(n::text)::uuid,'App '||n,null,'website','Description',n%11=0,n%7,now()-n*interval '1 hour',case when n%9=0 then 'paused' else 'live' end,n%8<>0,case when n%6=0 then 'paid' else 'credit' end,n%12=0 from generate_series(1,80)n;
      insert into credit_transactions select md5(n::text)::uuid,(n%5)-2 from generate_series(1,80)n cross join generate_series(1,3)m;
      insert into test_responses select md5(('response'||n)::text)::uuid,md5(n::text)::uuid,case when n%4=0 then 'pending' else 'approved' end,n%3<>0,md5(('app'||((n%80)+1))::text)::uuid from generate_series(1,80)n;
      insert into feedback_ratings select md5(('response'||n)::text)::uuid,case n%3 when 0 then 'frowny' when 1 then 'neutral' else 'smiley' end from generate_series(1,70)n;
      insert into test_back_reminder_sequences select md5(((n%80)+1)::text)::uuid,md5(n::text)::uuid,n%2=0 from generate_series(1,80)n;
    `);
    const completed = await migration("20260606_earn_first_test_visibility_gate");
    await db.exec(completed.slice(0, completed.indexOf("grant execute")));
    const rates = await migration("20260409_test_back_rate_grace_period");
    await db.exec(
      rates.slice(
        rates.indexOf("create or replace function public.get_effective_test_back_rate_for_owner"),
        rates.indexOf("drop function if exists public.get_test_back_rate_transition"),
      ),
    );
    const old = await migration("20260828185137_home_trusted_submissions");
    await db.exec(old.split("list_home_trusted_submissions").join("baseline_home_rankings"));
    await db.exec(await migration("20260910211721_grouped_home_rankings"));
    for (const change of [
      "select 1",
      "update credit_transactions set amount=0",
      "delete from feedback_ratings",
      "delete from test_responses",
    ]) {
      await db.exec(change);
      const expected = (await db.query("select * from baseline_home_rankings()")).rows;
      expect(expected).toHaveLength(6);
      expect((await db.query("select * from list_home_trusted_submissions()")).rows).toEqual(
        expected,
      );
    }
  } finally {
    await db.close();
  }
}, 30_000);
