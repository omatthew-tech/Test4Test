// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const userId = "97000000-0000-0000-0000-000000000001";
const migration = new URL(
  "../../supabase/migrations/20260921153545_founder_welcome_tour.sql",
  import.meta.url,
);
const signup = () => db.query("select public.complete_founder_signup() as result");
const account = async () =>
  (
    await db.query<{ account_type: string; raw_user_meta_data: Record<string, unknown> }>(
      "select account_type, raw_user_meta_data from profiles join auth.users using(id) where id=$1",
      [userId],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create table public.profiles(id uuid primary key references auth.users(id), account_type text not null default 'pending');
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(migration, "utf8"));
}, 30_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("begin");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("insert into auth.users values($1, $2)", [
    userId,
    { display_name: "Avery", earn_platform_preferences: ["website"] },
  ]);
  await db.query("insert into profiles(id) values($1)", [userId]);
});
afterEach(async () => db.exec("rollback; reset role"));

it("atomically enrolls a newly completed founder and preserves other metadata", async () => {
  await db.exec("set local role authenticated");
  const result = await signup();
  expect(result.rows[0]).toEqual({ result: { accountType: "founder" } });
  await db.exec("reset role");
  expect(await account()).toEqual({
    account_type: "founder",
    raw_user_meta_data: {
      display_name: "Avery",
      earn_platform_preferences: ["website"],
      founder_welcome_v1: "pending",
    },
  });
});

it.each(["completed", "dismissed"])("never resets %s on repeated signup", async (status) => {
  await signup();
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data || $1::jsonb", [
    { founder_welcome_v1: status },
  ]);
  await signup();
  expect((await account()).raw_user_meta_data.founder_welcome_v1).toBe(status);
});

it("leaves existing founders unenrolled", async () => {
  await db.exec("update profiles set account_type='founder'");
  await signup();
  expect((await account()).raw_user_meta_data.founder_welcome_v1).toBeUndefined();
});

it("initializes null metadata", async () => {
  await db.exec("update auth.users set raw_user_meta_data=null");
  await signup();
  expect((await account()).raw_user_meta_data).toEqual({ founder_welcome_v1: "pending" });
});

it("rolls back the account transition if preference initialization fails", async () => {
  await db.exec(`
    create function auth.reject_test_update() returns trigger language plpgsql as $$
    begin raise exception 'Simulated metadata failure'; end; $$;
    create trigger reject_test_update before update on auth.users for each row execute function auth.reject_test_update();
    savepoint before_signup;
  `);
  await expect(signup()).rejects.toThrow("Simulated metadata failure");
  await db.exec("rollback to savepoint before_signup");
  expect((await account()).account_type).toBe("pending");
});

it("retains tester and unauthenticated restrictions", async () => {
  await db.exec("update profiles set account_type='tester'; savepoint before_signup");
  await expect(signup()).rejects.toThrow("already belongs to a tester");
  await db.exec("rollback to savepoint before_signup");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await expect(signup()).rejects.toThrow("Verify your email");
});

it("does not grant the signup function to anonymous callers", async () => {
  const result = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon', 'public.complete_founder_signup()', 'EXECUTE') as allowed",
  );
  expect(result.rows[0].allowed).toBe(false);
});
