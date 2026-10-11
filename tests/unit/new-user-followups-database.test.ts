// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = async (sql: string, args: unknown[] = []) =>
  (await db.query<Record<string, any>>(sql, args)).rows;
const job = async (n = 1) =>
  (await rows("select * from private.new_user_followups where user_id=$1", [id(n)]))[0];
const action = async (
  name: string,
  user = null as string | null,
  lease = null as string | null,
  outcome = null as string | null,
) =>
  (
    await rows("select public.new_user_followup_worker($1,$2,$3,$4) result", [
      name,
      user,
      lease,
      outcome,
    ])
  )[0].result;
const due = () =>
  db.exec("update private.new_user_followups set due_at=now(),next_attempt_at=now()");
const submit = (n = 10, owner = 1) =>
  db.exec(`insert into public.submissions values('${id(n)}','${id(owner)}')`);
const credit = (type = "earned_test", amount = 1) =>
  db.query("insert into public.credit_transactions(user_id,type,amount) values($1,$2,$3)", [
    id(1),
    type,
    amount,
  ]);
const signIn = (n = 1) =>
  db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',true)`);
const click = () => rows("select public.record_share_link_copy_click($1)", [id(10)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema vault; create schema net;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,created_at timestamptz default now(),email text);
    create table public.profiles(id uuid primary key references auth.users on delete cascade,ban_status text default 'clear');
    create table public.submissions(id uuid primary key,user_id uuid references auth.users on delete cascade);
    create table public.credit_transactions(id serial primary key,user_id uuid,type text,amount integer,created_at timestamptz default now());
    create table public.email_templates(key text primary key,description text,subject_template text,text_template text,html_template text);
    create table private.background_scheduler_health(action text primary key,result jsonb);
    create function private.background_scheduler_tick(p_action text) returns jsonb language plpgsql as $$
      begin insert into private.background_scheduler_health values(p_action,'{"chat":false}')
        on conflict(action) do update set result=excluded.result; return '{"chat":false}'; end $$;
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz default now());
    insert into vault.decrypted_secrets(name,decrypted_secret) values('project_url','https://example.test'),('test_back_reminder_cron_secret','secret');
    create table net.requests(url text,headers jsonb,body jsonb,timeout_ms integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      begin insert into net.requests values(url,headers,body,timeout_milliseconds); return 1; end $$;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261011143243_new_user_inactivity_followup.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`begin;
    update private.new_user_followup_config set enabled=true,launched_at=now()-interval '1 minute';
    insert into auth.users(id,email) values('${id(1)}','new@example.test'),('${id(2)}','other@example.test');
    insert into profiles(id) values('${id(1)}'),('${id(2)}');`);
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});

it("enrolls only post-launch users, atomically, with a server-owned 70-minute due time", async () => {
  await db.exec("update private.new_user_followup_config set enabled=false");
  await submit();
  expect(await job()).toBeUndefined();
  await db.exec(
    "delete from submissions; update private.new_user_followup_config set enabled=true; update auth.users set created_at=now()-interval '1 day'",
  );
  await submit();
  expect(await job()).toBeUndefined();
  await db.exec(
    "delete from submissions; update auth.users set created_at=now(); savepoint submission",
  );
  await submit();
  const q = await job();
  expect(new Date(q.due_at).getTime() - new Date(q.submitted_at).getTime()).toBe(70 * 60 * 1000);
  expect(await action("claim")).toEqual([]);
  await db.exec("rollback to submission");
  expect(await job()).toBeUndefined();
});
it("keeps one lifetime timer despite repeat submissions and deletion/replacement", async () => {
  await submit();
  const first = await job();
  await submit(11);
  expect(await job()).toEqual(first);
  await db.exec("delete from submissions");
  await submit(12);
  expect((await job()).submitted_at).toEqual(first.submitted_at);
  expect((await job()).submission_id).toBeNull();
});
it("counts earned history before enrollment and retains cancellation after spent/deleted credit", async () => {
  await credit();
  await credit("feedback_unlock", -1);
  await submit();
  expect((await job()).status).toBe("cancelled");
  await db.exec("delete from credit_transactions");
  expect((await job()).earned_at).not.toBeNull();
  expect(await action("claim")).toEqual([]);
});
it("ignores purchases/adjustments and cancels credit activity while claimed", async () => {
  await submit();
  await credit("purchase");
  await credit("adjustment");
  await due();
  const [claimed] = await action("claim");
  expect(claimed.user_id).toBe(id(1));
  await credit();
  expect(await action("begin", claimed.user_id, claimed.lease_id)).toBeNull();
  expect((await job()).status).toBe("cancelled");
});
it("records idempotent owned clicks and blocks anonymous/cross-user access", async () => {
  await submit();
  await signIn(2);
  await expect(click()).rejects.toThrow("Submission unavailable");
  // An error aborts this transaction; use savepoints for intentional denials below.
});
it("keeps the first click and cancels the claimed job before sending", async () => {
  await submit();
  await due();
  const [claimed] = await action("claim");
  await signIn();
  await click();
  await click();
  await db.exec("reset role");
  const q = await job();
  expect(q.copy_clicked_at).not.toBeNull();
  expect(q.status).toBe("cancelled");
  expect(await action("begin", claimed.user_id, claimed.lease_id)).toBeNull();
});
it("denies queue, config and worker access to browser roles", async () => {
  await signIn();
  for (const sql of [
    "select * from private.new_user_followups",
    "update private.new_user_followup_config set enabled=true",
    "select public.new_user_followup_worker('claim')",
  ]) {
    await db.exec("savepoint denied");
    await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    await db.exec("rollback to denied");
  }
  await db.exec("reset role; set role anon; savepoint denied");
  await expect(click()).rejects.toThrow(/permission denied/);
  await db.exec("rollback to denied; reset role; set role service_role");
  expect((await action("inspect")).enabled).toBe(true);
});
it.each(["ban", "delete-app"])("rechecks %s just before provider delivery", async (change) => {
  await submit();
  await due();
  const [q] = await action("claim");
  await db.exec(
    change === "ban" ? "update profiles set ban_status='banned'" : "delete from submissions",
  );
  expect(await action("begin", q.user_id, q.lease_id)).toBeNull();
  expect((await job()).status).toBe("cancelled");
});
it("cascades deleted accounts and doesn't send before the exact due boundary", async () => {
  await submit();
  await due();
  await db.exec("update private.new_user_followups set due_at=now()+interval '1 second'");
  expect(await action("claim")).toEqual([]);
  await due();
  expect(await action("claim")).toHaveLength(1);
  await db.exec("delete from auth.users");
  expect(await job()).toBeUndefined();
});
it("prevents overlapping claims and stale completions, recovering only unsent claims", async () => {
  await submit();
  await due();
  const [first] = await action("claim");
  expect(await action("claim")).toEqual([]);
  await db.exec("update private.new_user_followups set lease_until=now()-interval '1 second'");
  const [second] = await action("claim");
  expect(second.lease_id).not.toBe(first.lease_id);
  expect(await action("begin", first.user_id, first.lease_id)).toBeNull();
  expect(await action("begin", second.user_id, second.lease_id)).toMatchObject({
    email: "new@example.test",
  });
  await db.exec("update private.new_user_followups set lease_until=now()-interval '1 second'");
  expect(await action("claim")).toEqual([]);
  expect((await job()).status).toBe("review");
});
it("backs off confirmed rejections, stops at five attempts, and never retries ambiguous sends", async () => {
  await submit();
  await due();
  const [q] = await action("claim");
  await action("begin", q.user_id, q.lease_id);
  await action("finish", q.user_id, q.lease_id, "rejected");
  expect(await action("claim")).toEqual([]);
  await due();
  const [retry] = await action("claim");
  await action("begin", retry.user_id, retry.lease_id);
  await action("finish", retry.user_id, retry.lease_id, "unknown");
  expect((await job()).status).toBe("review");
  await db.exec("update private.new_user_followups set status='pending',attempt_count=4");
  await due();
  const [last] = await action("claim");
  await action("begin", last.user_id, last.lease_id);
  await action("finish", last.user_id, last.lease_id, "rejected");
  expect((await job()).status).toBe("failed");
});
it("pauses enrollment/dispatch/claimed sends without cancelling them and has read-only inspection", async () => {
  await submit();
  await due();
  const [q] = await action("claim");
  await db.exec("update private.new_user_followup_config set enabled=false");
  expect(await action("begin", q.user_id, q.lease_id)).toBeNull();
  const before = await job();
  await action("inspect");
  expect(await job()).toEqual(before);
  expect(before.status).toBe("pending");
  await db.exec("select private.background_scheduler_tick('recover')");
  expect(await rows("select * from net.requests")).toHaveLength(0);
  await db.exec(
    "update private.new_user_followup_config set enabled=true; select private.background_scheduler_tick('recover')",
  );
  expect((await rows("select * from net.requests"))[0]).toMatchObject({
    url: "https://example.test/functions/v1/send-new-user-followups",
    timeout_ms: 120000,
  });
  expect((await rows("select result from private.background_scheduler_health"))[0].result).toEqual({
    chat: false,
    newUserFollowups: true,
  });
});
it("stores exact copy in plain text and semantic HTML", async () => {
  const template = (await rows("select * from email_templates"))[0];
  expect(template.subject_template).toBe("Question about Test4Test?");
  expect(template.text_template).toBe(
    "Hey there,\n\nI noticed you signed up but didn't earn any credits or share your link. Can you share why?\n\nI'm on a mission to make user feedback accessible for everyone because everyone deserves the opportunity to build something amazing.\n\nJust reply to this email. We appreciate any feedback!\n\nThanks,\nMatt @ Test4Test",
  );
  expect(template.html_template).toContain("<strong>Just reply to this email</strong>.");
});
