// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.user_id', true),'')::uuid $$;
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select current_setting('request.access',true) = 'yes' $$;
    create function private.current_user_account_type() returns text language sql stable as $$ select current_setting('request.account',true) $$;
    grant usage on schema auth, private to authenticated;
    create table submissions(id int primary key, user_id uuid);
    create table test_responses(id int primary key, submission_id int references submissions(id));
    create table feedback_ratings(id int primary key, test_response_id int references test_responses(id), rated_by_user_id uuid);
    alter table feedback_ratings enable row level security;
    create policy rating_read on feedback_ratings for select to authenticated using (true);
    grant select on submissions, test_responses, feedback_ratings to authenticated;
    insert into submissions values (1,'${owner}'),(2,'${other}');
    insert into test_responses values(1,1),(2,2);
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260918013000_clear_recording_rating.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30_000);
afterAll(async () => db?.close());

it.each([
  { user: owner, account: "founder", access: "yes", response: 1, expected: 1 },
  { user: other, account: "founder", access: "yes", response: 1, expected: 0 },
  { user: owner, account: "tester", access: "yes", response: 1, expected: 0 },
  { user: owner, account: "founder", access: "no", response: 1, expected: 0 },
  { user: owner, account: "founder", access: "yes", response: 2, expected: 0 },
])("only the eligible app owner may clear their own rating: %j", async (scenario) => {
  await db.exec(`begin; insert into feedback_ratings values (1,${scenario.response},'${owner}');
    select set_config('request.user_id','${scenario.user}',true);
    select set_config('request.account','${scenario.account}',true);
    select set_config('request.access','${scenario.access}',true); set local role authenticated;`);
  try {
    const result = await db.query("delete from feedback_ratings where id = 1 returning id");
    expect(result.rows).toHaveLength(scenario.expected);
  } finally {
    await db.exec("rollback");
  }
});
