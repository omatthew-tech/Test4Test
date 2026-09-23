// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const id = (n: number) => `94000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db: PGlite;
let repair: string;

beforeAll(async () => {
  repair = await readFile(
    new URL(
      "../../supabase/migrations/20260921194146_repair_submitted_feedback_star_ratings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select coalesce(current_setting('request.allowed',true),'true')='true' $$;
    create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select true $$;
    create function public.get_effective_test_back_rate_for_owner(uuid) returns table(owner_test_back_rate_percent integer) language sql stable as $$ select 100 $$;
    create function public.get_my_earn_visibility_summary() returns text language sql as $$ select 'newer earn contract'::text $$;
    create table submissions(id uuid primary key,user_id uuid,product_name text default 'App',product_types text[],product_type text default 'website',description text default '',status text default 'live',needs_google_play_closed_testers boolean default false);
    create table test_responses(id uuid primary key,submission_id uuid,tester_user_id uuid,status text default 'approved',credit_awarded boolean default true,submitted_at timestamptz default now());
    create table feedback_ratings(id uuid primary key default gen_random_uuid(),test_response_id uuid,rated_by_user_id uuid,rating_value text not null check(rating_value in ('frowny','neutral','smiley')),star_rating smallint check(star_rating between 1 and 5));
    create table feedback_rating_reports(test_response_id uuid,reporter_user_id uuid,status text);
    create table notification_calls(response_id uuid);
    create function public.notify_rating() returns trigger language plpgsql as $$ begin insert into notification_calls values(new.test_response_id); return new; end $$;
    insert into submissions(id,user_id) values('${id(10)}','${id(2)}');
    insert into test_responses(id,submission_id,tester_user_id)
      select ('94000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(10)}','${id(1)}' from generate_series(21,26)n;
    insert into test_responses(id,submission_id,tester_user_id) values('${id(30)}','${id(10)}','${id(3)}');
    insert into feedback_ratings(test_response_id,rated_by_user_id,rating_value,star_rating) values
      ('${id(21)}','${id(2)}','frowny',null),('${id(22)}','${id(2)}','neutral',null),
      ('${id(23)}','${id(2)}','smiley',null),('${id(24)}','${id(2)}','smiley',2),
      ('${id(25)}','${id(2)}','frowny',4);
    create trigger sync_paid_test_notifications_after_rating after insert or update of star_rating on feedback_ratings for each row execute function public.notify_rating();
    create function public.get_my_submitted_feedback_cards() returns table(response_id uuid,rating_value text) language sql as $$ select test_response_id,rating_value from feedback_ratings $$;
  `);
  await db.exec(repair);
}, 30_000);
afterAll(async () => db?.close());

it("converts legacy scores, preserves exact stars and original faces, and is safe to rerun", async () => {
  const ratings = () =>
    db.query("select rating_value,star_rating from feedback_ratings order by test_response_id");
  const expected = [
    { rating_value: "frowny", star_rating: 1 },
    { rating_value: "neutral", star_rating: 3 },
    { rating_value: "smiley", star_rating: 5 },
    { rating_value: "smiley", star_rating: 2 },
    { rating_value: "frowny", star_rating: 4 },
  ];
  expect((await ratings()).rows).toEqual(expected);
  await db.exec(repair);
  expect((await ratings()).rows).toEqual(expected);
  expect((await db.query("select * from notification_calls")).rows).toEqual([]);
  expect((await db.query("select get_my_earn_visibility_summary() as result")).rows).toEqual([
    { result: "newer earn contract" },
  ]);
});

it("returns stars and unrated reviews only for the signed-in reviewer", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
  const { rows } = await db.query(
    "select response_id,star_rating from get_my_submitted_feedback_cards() order by response_id",
  );
  expect(rows).toEqual(
    [1, 3, 5, 2, 4, null].map((stars, index) => ({
      response_id: id(21 + index),
      star_rating: stars,
    })),
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(3)]);
  expect(
    (await db.query("select response_id,star_rating from get_my_submitted_feedback_cards()")).rows,
  ).toEqual([{ response_id: id(30), star_rating: null }]);
});

it("retains access checks and denies anonymous execution", async () => {
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await expect(db.query("select * from get_my_submitted_feedback_cards()")).rejects.toThrow(
    "signed in",
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
  await db.exec("select set_config('request.allowed','false',false)");
  await expect(db.query("select * from get_my_submitted_feedback_cards()")).rejects.toThrow(
    "cannot access",
  );
  await db.exec("select set_config('request.allowed','true',false)");
  expect(
    (
      await db.query(
        "select has_function_privilege('anon','public.get_my_submitted_feedback_cards()','execute') as anon, has_function_privilege('authenticated','public.get_my_submitted_feedback_cards()','execute') as member",
      )
    ).rows,
  ).toEqual([{ anon: false, member: true }]);
});

it("accepts new exact ratings without a face value and restores normal notifications", async () => {
  await db.exec("begin");
  try {
    await db.query(
      "insert into feedback_ratings(test_response_id,rated_by_user_id,star_rating) values($1,$2,4)",
      [id(26), id(2)],
    );
    expect(
      (
        await db.query(
          "select rating_value,star_rating from feedback_ratings where test_response_id=$1",
          [id(26)],
        )
      ).rows,
    ).toEqual([{ rating_value: null, star_rating: 4 }]);
    expect((await db.query("select * from notification_calls")).rows).toEqual([
      { response_id: id(26) },
    ]);
  } finally {
    await db.exec("rollback");
  }
});

it.each([null, 0, 6])("rejects an invalid stored rating %s", async (value) => {
  await expect(
    db.query(
      "insert into feedback_ratings(test_response_id,rated_by_user_id,star_rating) values($1,$2,$3)",
      [id(26), id(2), value],
    ),
  ).rejects.toThrow();
});
