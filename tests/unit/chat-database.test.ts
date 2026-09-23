// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";

const founder = "00000000-0000-4000-8000-000000000001";
const tester = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
const app = "00000000-0000-4000-8000-000000000004";
const response = "00000000-0000-4000-8000-000000000005";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth, public to authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles(id uuid primary key, display_name text, email text, ban_status text default 'clear');
    create table public.submissions(id uuid primary key, user_id uuid references profiles(id), product_name text);
    create table public.test_responses(id uuid primary key, submission_id uuid references submissions(id) on delete cascade, tester_user_id uuid references profiles(id));
    create table public.email_templates(key text primary key, description text, subject_template text, text_template text, html_template text);
    grant select on public.profiles, public.submissions, public.test_responses to service_role;`);
  await db.exec(
    await readFile(
      new URL("../../supabase/migrations/20260920194929_in_app_chat.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260923173203_allow_tester_started_conversations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`truncate public.profiles, public.submissions, public.test_responses, public.chat_conversations, public.chat_messages, public.chat_read_states, public.chat_notification_outbox restart identity cascade;
    insert into profiles(id,display_name,email) values ('${founder}','Founder','founder@example.test'),('${tester}','Tester','tester@example.test'),('${outsider}','Other','other@example.test');
    insert into submissions values ('${app}','${founder}','Example app');
    insert into test_responses values ('${response}','${app}','${tester}');`);
});
async function asUser<T = unknown>(actor: string | null, sql: string, parameters: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [actor ?? ""]);
    await tx.exec("set local role authenticated");
    return (await tx.query<{ result: T }>(sql, parameters)).rows[0]?.result;
  });
}
const send = (
  actor = founder,
  conversation: string | null = null,
  body = "Hello",
  requestId = crypto.randomUUID(),
) =>
  asUser<{ conversationId: string; messageId: string }>(
    actor,
    "select public.chat_send($1, $2, $3, $4) result",
    [requestId, body, conversation, conversation ? null : response],
  );
const rows = async (sql: string, params: unknown[] = []) =>
  (await db.query<Record<string, any>>(sql, params)).rows;

it("creates nothing when opening a composer, then atomically saves message, participants and three jobs", async () => {
  const context = await asUser<{ id: null; peerName: string }>(
    founder,
    "select chat_context($1,null) result",
    [response],
  );
  expect(context).toMatchObject({ id: null, peerName: "Tester" });
  expect(await rows("select * from chat_conversations")).toHaveLength(0);
  const sent = await send();
  expect(sent.conversationId).toBeTruthy();
  expect(await rows("select * from chat_messages")).toHaveLength(1);
  expect(await rows("select * from chat_read_states")).toHaveLength(2);
  const jobs = await rows(
    "select stage, extract(epoch from (next_attempt_at - created_at))/86400 as days from chat_notification_outbox order by stage",
  );
  expect(jobs.map((job) => [job.stage, Number(job.days)])).toEqual([
    [0, 0],
    [3, 3],
    [7, 7],
  ]);
});

it("rejects anonymous users, outsiders and anonymous recordings", async () => {
  for (const actor of [null, outsider]) {
    await expect(
      asUser(actor, "select chat_context($1,null) result", [response]),
    ).rejects.toThrow();
    await expect(
      asUser(actor, "select chat_send($1,'Hello',null,$2) result", [crypto.randomUUID(), response]),
    ).rejects.toThrow();
  }
  await db.exec("update test_responses set tester_user_id=null");
  await expect(send()).rejects.toThrow();
  expect(await rows("select * from chat_conversations")).toHaveLength(0);
});

it("lets the response's tester start a founder conversation and reuses it from both sides", async () => {
  const context = await asUser(tester, "select chat_context($1,null) result", [response]);
  expect(context).toMatchObject({ id: null, peerName: "Founder", canSend: true });
  expect(await rows("select * from chat_conversations")).toHaveLength(0);
  const first = await send(tester, null, "Thanks for sharing your app!");
  expect(await rows("select founder_user_id, tester_user_id from chat_conversations")).toEqual([
    { founder_user_id: founder, tester_user_id: tester },
  ]);
  expect(await asUser(tester, "select chat_context($1,null) result", [response])).toMatchObject({
    id: first.conversationId,
    peerName: "Founder",
  });
  expect(await asUser(founder, "select chat_context($1,null) result", [response])).toMatchObject({
    id: first.conversationId,
    peerName: "Tester",
  });
  expect((await send(founder, null, "Thanks for testing!")).conversationId).toBe(
    first.conversationId,
  );
  const revision = crypto.randomUUID();
  await db.query("insert into test_responses values ($1,$2,$3)", [revision, app, tester]);
  expect(await asUser(tester, "select chat_context($1,null) result", [revision])).toMatchObject({
    id: first.conversationId,
  });
  expect(await rows("select * from chat_conversations")).toHaveLength(1);
  expect(
    await rows(
      "select recipient_user_id from chat_notification_outbox where stage=0 order by created_at",
    ),
  ).toEqual([{ recipient_user_id: founder }, { recipient_user_id: tester }]);
  expect(await asUser(outsider, "select count(*)::int result from chat_messages")).toBe(0);
});

it("rejects a tester targeting another response and keeps unavailable founders read-only", async () => {
  const otherResponse = crypto.randomUUID();
  await db.query("insert into test_responses values ($1,$2,$3)", [otherResponse, app, outsider]);
  await expect(
    asUser(tester, "select chat_context($1,null) result", [otherResponse]),
  ).rejects.toThrow();
  await expect(
    asUser(tester, "select chat_send($1,'Hello',null,$2) result", [
      crypto.randomUUID(),
      otherResponse,
    ]),
  ).rejects.toThrow();
  await db.query("update profiles set ban_status='banned' where id=$1", [founder]);
  expect(await asUser(tester, "select chat_context($1,null) result", [response])).toMatchObject({
    canSend: false,
  });
  await expect(send(tester)).rejects.toThrow("unavailable");
  expect(await rows("select * from chat_conversations")).toHaveLength(0);
});

it("allows both participants to reply while RLS hides conversation and messages from others", async () => {
  const { conversationId } = await send();
  await send(tester, conversationId, "Thanks!");
  expect(
    await asUser<{ items: unknown[] }>(tester, "select chat_history($1) result", [conversationId]),
  ).toMatchObject({ items: expect.any(Array) });
  for (const actor of [founder, tester, outsider]) {
    const count = await asUser<number>(actor, "select count(*)::int result from chat_messages");
    expect(count).toBe(actor === outsider ? 0 : 2);
  }
  await expect(send(outsider, conversationId)).rejects.toThrow();
  await expect(
    asUser(outsider, "select chat_history($1) result", [conversationId]),
  ).rejects.toThrow();
  await expect(
    asUser(founder, "update chat_messages set body='Tampered' returning body result"),
  ).rejects.toThrow();
  await expect(
    asUser(founder, "select count(*) result from chat_notification_outbox"),
  ).rejects.toThrow();
  await expect(asUser(founder, "select * from claim_chat_notifications()")).rejects.toThrow();
  const inbox = await asUser<{ items: unknown[] }>(tester, "select chat_list() result");
  expect(JSON.stringify(inbox)).not.toContain("@example.test");
});

it("reuses conversations across responses and deduplicates retries, including concurrent requests", async () => {
  const requestId = crypto.randomUUID();
  const [first, second] = await Promise.all([
    send(founder, null, "Hello", requestId),
    send(founder, null, "Hello", requestId),
  ]);
  expect(second).toEqual(first);
  await expect(send(founder, first.conversationId, "Changed", requestId)).rejects.toThrow(
    "already used",
  );
  const revision = crypto.randomUUID();
  await db.query("insert into test_responses values ($1,$2,$3)", [revision, app, tester]);
  const next = await asUser<{ conversationId: string }>(
    founder,
    "select chat_send($1,'Revision',null,$2) result",
    [crypto.randomUUID(), revision],
  );
  expect(next.conversationId).toBe(first.conversationId);
  expect(await rows("select * from chat_conversations")).toHaveLength(1);
  expect(await rows("select * from chat_notification_outbox where stage=0")).toHaveLength(2);
});

it("validates text and enforces the sender-wide rate limit without losing idempotent retries", async () => {
  for (const text of ["", " \n\t ", "x".repeat(4001)])
    await expect(send(founder, null, text)).rejects.toThrow();
  const id = crypto.randomUUID();
  const first = await send(founder, null, "😀".repeat(4000), id);
  for (let index = 1; index < 20; index++) await send(founder, first.conversationId);
  await expect(send(founder, first.conversationId)).rejects.toThrow("too quickly");
  expect(await send(founder, first.conversationId, "😀".repeat(4000), id)).toEqual(first);
  expect(await rows("select * from chat_messages")).toHaveLength(20);
});

it("groups reminders without restarting, cancels only reminders on read, and starts a later unread period", async () => {
  const { conversationId } = await send();
  const original = await rows(
    "select unread_epoch, next_attempt_at, stage from chat_notification_outbox where stage<>0 order by stage",
  );
  await send(founder, conversationId, "Second message");
  expect(
    await rows(
      "select unread_epoch, next_attempt_at, stage from chat_notification_outbox where stage<>0 order by stage",
    ),
  ).toEqual(original);
  const messages = await rows("select sequence from chat_messages order by sequence");
  await asUser(tester, "select chat_mark_read($1,$2) result", [
    conversationId,
    messages[0].sequence,
  ]);
  expect(
    await rows("select * from chat_notification_outbox where stage<>0 and status='pending'"),
  ).toHaveLength(2);
  await asUser(tester, "select chat_mark_read($1,$2) result", [
    conversationId,
    messages[1].sequence,
  ]);
  expect(
    await rows("select * from chat_notification_outbox where stage<>0 and status='cancelled'"),
  ).toHaveLength(2);
  expect(
    await rows("select * from chat_notification_outbox where stage=0 and status='pending'"),
  ).toHaveLength(2);
  await send(founder, conversationId, "New unread period");
  expect(
    await rows("select * from chat_notification_outbox where stage<>0 and status='pending'"),
  ).toHaveLength(2);
});

it("claims due jobs once, rechecks unread eligibility, fences stale workers and bounds retries", async () => {
  const { conversationId } = await send();
  const claimed = await rows("select * from claim_chat_notifications()");
  expect(claimed).toHaveLength(1);
  expect(await rows("select * from claim_chat_notifications()")).toHaveLength(0);
  const first = claimed[0];
  const context = await rows("select chat_notification_context($1,$2) result", [
    first.id,
    first.lease_id,
  ]);
  expect(context[0].result).toMatchObject({ founderSent: true, body: "Hello", stage: 0 });
  expect(
    (
      await rows("select finish_chat_notification($1,$2,'sent') result", [
        first.id,
        crypto.randomUUID(),
      ])
    )[0].result,
  ).toBe(false);
  await rows("select finish_chat_notification($1,$2,'sent') result", [first.id, first.lease_id]);
  await db.exec(
    "update chat_notification_outbox set next_attempt_at = now() - interval '1 second' where stage=3",
  );
  const reminder = (await rows("select * from claim_chat_notifications()"))[0];
  await asUser(tester, "select chat_mark_read($1,1) result", [conversationId]);
  expect(
    (
      await rows("select chat_notification_context($1,$2) result", [reminder.id, reminder.lease_id])
    )[0].result,
  ).toBeNull();
  await send(founder, conversationId);
  const retryJob = (await rows("select * from claim_chat_notifications()"))[0];
  await db.query(
    "update chat_notification_outbox set lease_until=now()-interval '1 minute' where id=$1",
    [retryJob.id],
  );
  const reclaimed = (await rows("select * from claim_chat_notifications()"))[0];
  expect(reclaimed.lease_id).not.toBe(retryJob.lease_id);
  await db.query(
    "update chat_notification_outbox set status='failed', attempt_count=5, next_attempt_at=now()-interval '1 day' where id=$1",
    [retryJob.id],
  );
  expect(await rows("select * from claim_chat_notifications()")).toHaveLength(0);
});

it("paginates history without overlaps and prevents forged or regressing read cursors", async () => {
  const { conversationId } = await send();
  await db.query(
    `insert into chat_messages(conversation_id,sender_user_id,client_request_id,body)
    select $1,$2,gen_random_uuid(),'Message '||n from generate_series(1,60) n`,
    [conversationId, founder],
  );
  const recent = await asUser<{ items: { sequence: number }[]; nextBefore: number }>(
    tester,
    "select chat_history($1) result",
    [conversationId],
  );
  const older = await asUser<{ items: { sequence: number }[] }>(
    tester,
    "select chat_history($1,$2) result",
    [conversationId, recent.nextBefore],
  );
  expect(recent.items).toHaveLength(50);
  expect(older.items).toHaveLength(11);
  expect(new Set([...older.items, ...recent.items].map((item) => item.sequence)).size).toBe(61);
  await expect(
    asUser(tester, "select chat_mark_read($1,99999) result", [conversationId]),
  ).rejects.toThrow();
  await asUser(tester, "select chat_mark_read($1,61) result", [conversationId]);
  await asUser(tester, "select chat_mark_read($1,1) result", [conversationId]);
  expect(
    (await rows("select last_read_sequence from chat_read_states where user_id=$1", [tester]))[0]
      .last_read_sequence,
  ).toBe(61);
});

it("enforces bans and cascades chat data when its app is explicitly deleted", async () => {
  const { conversationId } = await send();
  await db.query("update profiles set ban_status='banned' where id=$1", [tester]);
  await expect(send(tester, conversationId)).rejects.toThrow();
  await expect(send(founder, conversationId)).rejects.toThrow();
  expect(await asUser<number>(tester, "select count(*)::int result from chat_messages")).toBe(0);
  const job = (await rows("select * from claim_chat_notifications()"))[0];
  expect(
    (await rows("select chat_notification_context($1,$2) result", [job.id, job.lease_id]))[0]
      .result,
  ).toBeNull();
  await db.query("delete from submissions where id=$1", [app]);
  expect(await rows("select * from chat_messages")).toHaveLength(0);
  expect(await rows("select * from chat_notification_outbox")).toHaveLength(0);
});
