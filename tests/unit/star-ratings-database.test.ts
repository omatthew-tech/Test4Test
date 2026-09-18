// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `93000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const functionSQL = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};
let db: PGlite;
let starsMigration: string;

beforeAll(async () => {
  db = new PGlite();
  starsMigration = await migration("20260918021245_exact_star_ratings");
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select coalesce(current_setting('request.allowed',true),'true')='true' $$;
    create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select $1 <> '${id(99)}'::uuid $$;
    create function public.get_effective_test_back_rate_for_owner(uuid) returns table(owner_test_back_rate_percent integer) language sql stable as $$ select 100 $$;
    create table submissions(id uuid primary key,user_id uuid,product_name text default 'App',product_types text[],product_type text default 'website',description text default '',promoted boolean default false,response_count integer default 0,created_at timestamptz default now(),status text default 'live',is_open_for_more_tests boolean default true,reward_type text default 'credit',needs_google_play_closed_testers boolean default false);
    create table test_responses(id uuid primary key,submission_id uuid,tester_user_id uuid,status text default 'approved',credit_awarded boolean default true,submitted_at timestamptz default now());
    create table feedback_ratings(id uuid primary key default gen_random_uuid(),test_response_id uuid,rated_by_user_id uuid,rating_value text not null check(rating_value in ('frowny','neutral','smiley')),star_rating smallint check(star_rating between 1 and 5),unique(test_response_id,rated_by_user_id));
    create table feedback_rating_reports(id uuid primary key default gen_random_uuid(),test_response_id uuid,reporter_user_id uuid,status text,message text,updated_at timestamptz,unique(test_response_id,reporter_user_id));
    create table credit_transactions(user_id uuid,amount integer);
    create table test_response_versions(id uuid primary key);
    create table test_response_recording_uploads(id uuid primary key);
    create table notification_calls(tester uuid);
    create function private.enqueue_existing_paid_tests_for_tester(uuid) returns void language sql as $$ insert into public.notification_calls values($1) $$;
    insert into submissions(id,user_id) values('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}');
    insert into test_responses(id,submission_id,tester_user_id) select ('93000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(12)}','${id(1)}' from generate_series(21,26)n;
    insert into test_responses(id,submission_id,tester_user_id) values('${id(31)}','${id(11)}','${id(2)}');
    insert into feedback_ratings(test_response_id,rated_by_user_id,rating_value,star_rating) values
      ('${id(21)}','${id(2)}','frowny',null), ('${id(22)}','${id(2)}','neutral',null),
      ('${id(23)}','${id(2)}','smiley',null), ('${id(24)}','${id(2)}','smiley',null),
      ('${id(25)}','${id(2)}','smiley',2), ('${id(26)}','${id(2)}','neutral',4);
  `);
  const paid = await migration("20260820031244_tester_signup_paid_progression");
  await db.exec(functionSQL(paid, "private.tester_paid_access_counts"));
  await db.exec(functionSQL(paid, "public.sync_paid_test_notifications_for_tester"));
  await db.exec(
    `create trigger sync_paid_test_notifications_after_rating after insert or update of star_rating on feedback_ratings for each row execute function public.sync_paid_test_notifications_for_tester();`,
  );
  await db.exec(
    functionSQL(
      await migration("20260606_earn_first_test_visibility_gate"),
      "public.user_has_completed_credited_test",
    ),
  );
  await db.exec(starsMigration);
  await db.exec(
    `create trigger lock_pending_rating_report before insert or update of status on feedback_rating_reports for each row execute function private.lock_pending_rating_report();`,
  );
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role");
});

it("backfills 1/3/5, preserves explicit stars and legacy audit values, and reruns without notifications", async () => {
  const read = () =>
    db.query("select rating_value,star_rating from feedback_ratings order by test_response_id");
  const expected = [
    { rating_value: "frowny", star_rating: 1 },
    { rating_value: "neutral", star_rating: 3 },
    { rating_value: "smiley", star_rating: 5 },
    { rating_value: "smiley", star_rating: 5 },
    { rating_value: "smiley", star_rating: 2 },
    { rating_value: "neutral", star_rating: 4 },
  ];
  expect((await read()).rows).toEqual(expected);
  // The migration is itself transactional; omit its wrapper inside this test transaction.
  await db.exec(starsMigration.replace("begin;", "").replace(/commit;\s*$/, ""));
  expect((await read()).rows).toEqual(expected);
  expect((await db.query("select * from notification_calls")).rows).toHaveLength(0);
  await db.exec(`update feedback_ratings set star_rating=5 where test_response_id='${id(25)}'`);
  expect((await db.query("select * from notification_calls")).rows).toEqual([{ tester: id(1) }]);
});

it.each([null, 0, 6, -1])("rejects invalid database stars %s", async (value) => {
  await expect(
    db.query(
      "insert into feedback_ratings(test_response_id,rated_by_user_id,star_rating) values($1,$2,$3)",
      [id(31), id(1), value],
    ),
  ).rejects.toThrow();
});

it("accepts stars without a legacy value and preserves independent credit awards", async () => {
  await db.exec(
    `insert into feedback_ratings(test_response_id,rated_by_user_id,star_rating) values('${id(31)}','${id(1)}',4)`,
  );
  expect(
    (
      await db.query(
        "select rating_value,star_rating from feedback_ratings where test_response_id=$1",
        [id(31)],
      )
    ).rows,
  ).toEqual([{ rating_value: null, star_rating: 4 }]);
  expect((await db.query("select distinct credit_awarded from test_responses")).rows).toEqual([
    { credit_awarded: true },
  ]);
  expect((await db.query("select * from credit_transactions")).rows).toHaveLength(0);
});

it("counts migrated five-star responses distinctly with the original qualification filters", async () => {
  const counts = async () =>
    (await db.query("select * from private.tester_paid_access_counts($1)", [id(1)])).rows[0];
  expect(await counts()).toEqual({
    completed_credit_tests: 6,
    five_star_ratings: 2,
    paid_access_unlocked: true,
  });
  await db.exec(
    `insert into feedback_ratings(test_response_id,rated_by_user_id,star_rating) values('${id(23)}','${id(3)}',5)`,
  );
  expect(await counts()).toMatchObject({ five_star_ratings: 2 });
  await db.exec(`update test_responses set credit_awarded=false where id='${id(24)}'`);
  expect(await counts()).toMatchObject({ five_star_ratings: 1, paid_access_unlocked: false });
  await db.exec(`update test_responses set status='pending' where id='${id(23)}'`);
  expect(await counts()).toMatchObject({ five_star_ratings: 0 });
  await db.exec("update submissions set reward_type='paid'");
  expect(await counts()).toEqual({
    completed_credit_tests: 0,
    five_star_ratings: 0,
    paid_access_unlocked: false,
  });
});

async function assertReputation(expected: number) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
  expect(
    (
      await db.query(
        "select owner_satisfaction_rate_percent rate from get_earn_submission_reputation($1)",
        [[id(11)]],
      )
    ).rows,
  ).toEqual([{ rate: expected }]);
  const cards = await db.query(
    "select owner_satisfaction_rate_percent rate,star_rating,rating_value from get_my_submitted_feedback_cards()",
  );
  expect(cards.rows).toEqual([{ rate: expected, star_rating: null, rating_value: null }]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
  expect(
    (await db.query("select satisfaction_rate_percent rate from get_my_earn_visibility_summary()"))
      .rows,
  ).toEqual([{ rate: expected }]);
}

it.each([1, 2, 3, 4, 5])(
  "uses exact %s-star satisfaction consistently in all RPCs",
  async (stars) => {
    await db.query("update feedback_ratings set star_rating=$1", [stars]);
    await assertReputation(stars * 20);
  },
);

it("rounds mixed averages and excludes unrated, unapproved and uncredited responses", async () => {
  await assertReputation(67); // (1+3+5+5+2+4) / 6 * 20
  await db.exec(
    `update test_responses set credit_awarded=false where id='${id(21)}'; update test_responses set status='pending' where id='${id(22)}'`,
  );
  await assertReputation(80);
  await db.exec("delete from feedback_ratings");
  await assertReputation(100);
  await db.exec("update test_responses set credit_awarded=false");
  expect(
    (await db.query("select satisfaction_rate_percent rate from get_my_earn_visibility_summary()"))
      .rows,
  ).toEqual([{ rate: null }]);
});

it("home and visibility rankings distinguish two and four stars even with identical legacy categories", async () => {
  await db.exec(
    `update feedback_ratings set star_rating=2; insert into feedback_ratings(test_response_id,rated_by_user_id,rating_value,star_rating) values('${id(31)}','${id(1)}','smiley',4)`,
  );
  expect(
    (await db.query<{ id: string }>("select id from list_home_trusted_submissions()")).rows.map(
      (r) => r.id,
    ),
  ).toEqual([id(12), id(11)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
  expect((await db.query("select rank from get_my_earn_visibility_summary()")).rows).toEqual([
    { rank: 2 },
  ]);
});

const claim = (stars: number, user = id(1)) =>
  db.query<{ result: { claimed: boolean } }>(
    "select claim_feedback_rating_report($1,$2,$3::smallint,'Please review') result",
    [id(21), user, stars],
  );

it.each([1, 2, 3, 4])(
  "atomically claims %s-star reports once, including closed tests",
  async (stars) => {
    await db.query("update feedback_ratings set star_rating=$1 where test_response_id=$2", [
      stars,
      id(21),
    ]);
    await db.exec("update submissions set status='paused'");
    expect((await claim(stars)).rows[0].result.claimed).toBe(true);
    expect((await claim(stars)).rows[0].result.claimed).toBe(false);
    expect((await db.query("select * from feedback_rating_reports")).rows).toHaveLength(1);
  },
);

it.each(["five", "unrated", "changed", "owner", "banned"])(
  "rejects report with %s eligibility",
  async (scenario) => {
    if (scenario === "five") await db.exec("update feedback_ratings set star_rating=5");
    if (scenario === "unrated") await db.exec("delete from feedback_ratings");
    if (scenario === "changed") await db.exec("update feedback_ratings set star_rating=2");
    const reporter = scenario === "owner" ? id(2) : scenario === "banned" ? id(99) : id(1);
    await expect(claim(1, reporter)).rejects.toThrow();
  },
);

it("protects the report claim from client role calls and keeps RPC access checks", async () => {
  expect(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.claim_feedback_rating_report(uuid,uuid,smallint,text)','execute') allowed",
      )
    ).rows,
  ).toEqual([{ allowed: false }]);
  expect(
    (
      await db.query(
        "select has_function_privilege('service_role','public.claim_feedback_rating_report(uuid,uuid,smallint,text)','execute') allowed",
      )
    ).rows,
  ).toEqual([{ allowed: true }]);
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await expect(db.query("select * from get_my_submitted_feedback_cards()")).rejects.toThrow(
    "signed in",
  );
});
