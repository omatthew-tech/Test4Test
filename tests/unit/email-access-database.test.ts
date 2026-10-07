// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const owner = "41000000-0000-4000-8000-000000000001";
const other = "41000000-0000-4000-8000-000000000002";
const target = "41000000-0000-4000-8000-000000000003";
const response = "41000000-0000-4000-8000-000000000004";
const hash = "ab".repeat(32);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema auth, private to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz);
    create table profiles(id uuid primary key,ban_status text default 'clear');
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table submissions(id uuid primary key,user_id uuid);
    create table test_responses(id uuid primary key,submission_id uuid);
    create function private.feedback_access(uuid) returns boolean language sql stable as $$ select true $$;
    revoke all on function private.feedback_access(uuid) from public,anon;
    grant execute on function private.feedback_access(uuid) to authenticated;
    alter table test_responses enable row level security;
    create policy responses_select_related on test_responses for select using(private.feedback_access(id));
    create table questions(id uuid primary key, published boolean, instruction text);
    alter table questions enable row level security;
    create policy questions_read on questions for select using(published or exists(select 1 from test_responses));
    grant select on test_responses,questions to anon,authenticated;
    insert into questions values('${target}',true,'Published instructions');
    set role anon;
  `);
  await expect(db.query("select * from questions")).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261006121131_reusable_email_access_links.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`reset role; delete from auth.users; delete from profiles; delete from submissions; delete from test_responses; delete from private.email_access_rate_limits;
    insert into auth.users values('${owner}','owner@example.test',now(),null),('${other}','other@example.test',now(),null);
    insert into profiles(id) values('${owner}'),('${other}');
    insert into submissions values('${target}','${owner}'); insert into test_responses values('${response}','${target}');
    select set_config('request.jwt.claim.sub','${owner}',false);`);
});
async function issue(
  user = owner,
  email = "owner@example.test",
  destination = "feedback",
  resource = response,
  tokenHash = hash,
) {
  await db.query("select public.issue_email_access_link($1,$2,$3,$4,$5,'feedback_email')", [
    tokenHash,
    user,
    email,
    destination,
    resource,
  ]);
}
async function resolve() {
  return (
    await db.query<{ link: { user_id: string } | null }>(
      "select public.resolve_email_access_link($1) as link",
      [hash],
    )
  ).rows[0].link;
}
it("allows published instructions when signed out without exposing feedback", async () => {
  await db.exec("set role anon");
  expect((await db.query("select instruction from questions")).rows).toEqual([
    { instruction: "Published instructions" },
  ]);
  expect((await db.query("select * from test_responses")).rows).toEqual([]);
});
it("denies browser roles raw table access and issuance/redemption/lease RPCs", async () => {
  await issue();
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from private.email_access_links")).rejects.toThrow(
      /permission denied/,
    );
    await expect(resolve()).rejects.toThrow(/permission denied/);
    await expect(issue()).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select public.claim_email_access_session($1,$2)", [owner, other]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  expect(await resolve()).toMatchObject({ user_id: owner });
});
it("supports unlimited reuse after months and after the target is removed", async () => {
  await issue();
  await db.exec(
    "update private.email_access_links set created_at=now()-interval '180 days'; delete from test_responses; delete from submissions;",
  );
  for (let n = 0; n < 5; n++) expect(await resolve()).toMatchObject({ user_id: owner });
});
it("binds issuance to confirmed current email, ownership, and allowed accounts", async () => {
  await expect(issue(other, "other@example.test")).rejects.toThrow(/destination/);
  await expect(issue(owner, "old@example.test")).rejects.toThrow(/recipient/);
  await db.exec(`update auth.users set email_confirmed_at=null where id='${owner}'`);
  await expect(issue()).rejects.toThrow(/recipient/);
});
it("revokes only the caller's links and preserves current account/session records", async () => {
  await issue();
  await issue(other, "other@example.test", "test", target, "cd".repeat(32));
  await db.exec("set role authenticated");
  expect((await db.query("select public.revoke_my_email_access_links() as count")).rows).toEqual([
    { count: 1 },
  ]);
  await db.exec("reset role");
  expect(await resolve()).toBeNull();
  expect(
    (
      await db.query(
        "select count(*)::integer as count from private.email_access_links where revoked_at is null",
      )
    ).rows,
  ).toEqual([{ count: 1 }]);
  expect((await db.query("select count(*)::integer as count from auth.users")).rows).toEqual([
    { count: 2 },
  ]);
});
it("permanently revokes after email changes even if the old email is restored", async () => {
  await issue();
  await db.exec(
    `update auth.users set email='new@example.test' where id='${owner}'; update auth.users set email='owner@example.test' where id='${owner}'`,
  );
  expect(await resolve()).toBeNull();
});
it("rejects application bans, Auth bans, unverified emails, and deletes credentials with the account", async () => {
  await issue();
  for (const [block, unblock] of [
    ["update profiles set ban_status='banned'", "update profiles set ban_status='clear'"],
    [
      "update auth.users set banned_until=now()+interval '1 day'",
      "update auth.users set banned_until=null",
    ],
    [
      "update auth.users set email_confirmed_at=null",
      "update auth.users set email_confirmed_at=now()",
    ],
  ]) {
    await db.exec(block);
    expect(await resolve()).toBeNull();
    await db.exec(unblock);
  }
  await db.exec(`delete from auth.users where id='${owner}'`);
  expect(await resolve()).toBeNull();
  expect((await db.query("select * from private.email_access_links")).rows).toHaveLength(0);
});
it("leases serialize sessions, release only by claim, and recover after crashes", async () => {
  const claim = async (id: string) =>
    (
      await db.query<{ ok: boolean }>("select public.claim_email_access_session($1,$2) as ok", [
        owner,
        id,
      ])
    ).rows[0].ok;
  expect(await claim(target)).toBe(true);
  expect(await claim(response)).toBe(false);
  await db.query("select public.release_email_access_session($1,$2)", [owner, response]);
  expect(await claim(response)).toBe(false);
  await db.exec(
    "update private.email_access_session_leases set lease_until=now()-interval '1 second'",
  );
  expect(await claim(response)).toBe(true);
});
it("enforces atomic rate limits", async () => {
  const checks = await Promise.all(
    Array.from({ length: 4 }, () =>
      db.query<{ allowed: boolean }>(
        "select public.check_email_access_rate_limit($1,2) as allowed",
        [hash],
      ),
    ),
  );
  expect(checks.map((check) => check.rows[0].allowed)).toEqual([true, true, false, false]);
});
