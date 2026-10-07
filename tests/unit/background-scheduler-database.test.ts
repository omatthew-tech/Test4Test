// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const id = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = async (name: string) =>
  db.exec(
    await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"),
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema cron; create schema net; create schema vault;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key references auth.users(id), display_name text, email text, ban_status text default 'clear');
    create table public.submissions(id uuid primary key, user_id uuid references profiles(id), product_name text,
      description text default '', target_audience text default '', instruction_steps text[] default '{}', instructions text default '');
    create table public.test_responses(id uuid primary key, submission_id uuid references submissions(id), tester_user_id uuid,
      recording_bucket text, recording_path text, recording_deleted_at timestamptz, recording_uploaded_at timestamptz default now(),
      submitted_at timestamptz default now(), duration_seconds integer default 60);
    create table public.test_response_transcripts(id uuid primary key, test_response_id uuid references test_responses(id),
      provider text, model text, status text, language text, duration_ms bigint, full_text text, completed_at timestamptz);
    create table public.test_response_transcript_segments(id uuid primary key, transcript_id uuid references test_response_transcripts(id),
      segment_index integer, start_ms bigint, end_ms bigint, text text, words jsonb);
    create table public.email_templates(key text primary key, description text, subject_template text, text_template text, html_template text);
    grant all on all tables in schema public to service_role;
    create table cron.job_run_details(runid bigint primary key, end_time timestamptz, status text);
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz default now());
    insert into vault.decrypted_secrets(name,decrypted_secret) values
      ('project_url','https://example.test'),('transcript_dispatch_secret','test-transcript'),('chat_dispatch_secret','test-chat');
    create table net.requests(id bigserial primary key,url text,body jsonb,headers jsonb);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$
    declare v_id bigint;
    begin
      if current_setting('test.fail_dispatch',true)='true' then raise exception 'simulated unavailable dispatch'; end if;
      insert into net.requests(url,body,headers) values(url,body,headers) returning id into v_id; return v_id;
    end; $$;
  `);
  await migration("20260909011828_recording_transcript_reports");
  await migration("20260909012639_reuse_existing_recording_transcripts");
  await migration("20260920185754_recording_clips");
  await migration("20260920194929_in_app_chat");
  await migration("20261006150842_reduce_idle_background_scheduling");
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users values('${id(1)}'),('${id(2)}');
    insert into profiles(id,display_name,email) values('${id(1)}','Owner','owner@example.test'),('${id(2)}','Tester','tester@example.test');
    insert into submissions(id,user_id,product_name) values('${id(3)}','${id(1)}','Example');`);
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
const rows = async (sql: string, params: unknown[] = []) =>
  (await db.query<Record<string, any>>(sql, params)).rows;
const addRecording = (n = 10) =>
  db.exec(`insert into test_responses(id,submission_id,tester_user_id,recording_bucket,recording_path)
  values('${id(n)}','${id(3)}','${id(2)}','r2:recordings','${n}.webm')`);
const resetWake = () =>
  db.exec(
    "update private.background_dispatch_state set requested_at='-infinity'; delete from net.requests",
  );
const tick = (action = "recover") =>
  rows("select public.background_scheduler_tick($1) result", [action]);
async function chat(stage = 0, due = "now()") {
  await db.exec(`insert into chat_conversations(id,submission_id,founder_user_id,tester_user_id)
    values('${id(20)}','${id(3)}','${id(1)}','${id(2)}') on conflict do nothing;
    insert into chat_messages(id,conversation_id,sender_user_id,body,client_request_id)
    values('${id(21)}','${id(20)}','${id(1)}','Hello','${id(22)}') on conflict do nothing;
    insert into chat_notification_outbox(id,conversation_id,recipient_user_id,message_id,unread_epoch,stage,next_attempt_at)
    values('${id(30 + stage)}','${id(20)}','${id(2)}',${stage === 0 ? `'${id(21)}'` : "null"},${stage === 0 ? "null" : `'${id(24)}'`},${stage},${due});`);
}

it("does no HTTP dispatch when all queues are empty", async () => {
  expect((await tick())[0].result).toEqual({ transcripts: false, clips: false, chat: false });
  expect(await rows("select * from net.requests")).toHaveLength(0);
});
it("durably queues new transcripts and coalesces transaction bursts", async () => {
  await addRecording();
  await addRecording(11);
  expect(await rows("select * from recording_transcripts where status='pending'")).toHaveLength(2);
  expect(await rows("select * from net.requests")).toHaveLength(1);
  expect((await rows("select url from net.requests"))[0].url).toContain(
    "dispatch-recording-transcripts",
  );
});
it("rolls back the HTTP enqueue with its source transaction", async () => {
  await db.exec("savepoint source_save");
  await addRecording();
  await db.exec("rollback to source_save");
  expect(await rows("select * from recording_transcripts")).toHaveLength(0);
  expect(await rows("select * from net.requests")).toHaveLength(0);
});
it("preserves queued recordings when the dispatch subsystem fails", async () => {
  await db.exec("set local test.fail_dispatch='true'");
  await addRecording();
  expect(await rows("select * from recording_transcripts where status='pending'")).toHaveLength(1);
  expect(await rows("select * from net.requests")).toHaveLength(0);
  await db.exec("set local test.fail_dispatch='false'");
  expect((await tick())[0].result.transcripts).toBe(true);
});
it("sends initial chat notifications promptly but leaves future reminders asleep", async () => {
  await chat(3, "now()+interval '3 days'");
  expect(await rows("select * from net.requests")).toHaveLength(0);
  await chat();
  expect((await rows("select url from net.requests"))[0].url).toContain(
    "dispatch-chat-notifications",
  );
});
it("honors retry backoff and wakes manual transcript retries", async () => {
  await addRecording();
  await resetWake();
  await db.exec("update recording_transcripts set status='processing',attempt_count=1");
  await db.exec(
    "update recording_transcripts set status='pending',retry_after=now()+interval '5 minutes'",
  );
  expect((await tick())[0].result.transcripts).toBe(false);
  await db.exec("update recording_transcripts set status='failed'");
  await db.exec(
    "update recording_transcripts set status='pending',attempt_count=0,retry_after=now()",
  );
  expect(await rows("select * from net.requests")).toHaveLength(1);
});
it("completion wakes other ready work and ignores lease heartbeats", async () => {
  await addRecording();
  await addRecording(11);
  await resetWake();
  await db.exec(
    `update recording_transcripts set status='processing',attempt_count=1 where response_id='${id(10)}'`,
  );
  await db.exec(
    `update recording_transcripts set lease_expires_at=now()+interval '15 minutes' where response_id='${id(10)}'`,
  );
  expect(await rows("select * from net.requests")).toHaveLength(0);
  await db.exec(`update recording_transcripts set status='ready' where response_id='${id(10)}'`);
  expect(await rows("select * from net.requests")).toHaveLength(1);
});
it("recovers expired leases but does not redispatch active leases", async () => {
  await addRecording();
  await resetWake();
  await db.exec(
    "update recording_transcripts set status='processing',attempt_count=1,lease_expires_at=now()+interval '1 minute'",
  );
  expect((await tick())[0].result.transcripts).toBe(false);
  await db.exec("update recording_transcripts set lease_expires_at=now()-interval '1 minute'");
  expect((await tick())[0].result.transcripts).toBe(true);
});
it("caps history deletion, preserves active/recent runs, and separates hourly cleanup", async () => {
  await db.exec(`insert into cron.job_run_details select n,now()-interval '30 days','succeeded' from generate_series(1,600) n;
    insert into cron.job_run_details values(601,now(),'succeeded'),(602,null,'running');`);
  expect((await tick("maintain"))[0].result.historyDeleted).toBe(500);
  expect(await rows("select * from cron.job_run_details")).toHaveLength(102);
  expect((await rows("select body from net.requests"))[0].body).toEqual({ action: "cleanup" });
});
it("rejects public access to scheduler controls and claimed transcript reuse", async () => {
  expect(
    (
      await rows(
        `select has_function_privilege('anon','public.background_scheduler_tick(text)','execute') allowed`,
      )
    )[0].allowed,
  ).toBe(false);
  expect(
    (
      await rows(
        `select has_function_privilege('authenticated','public.reuse_claimed_recording_transcript(uuid,uuid)','execute') allowed`,
      )
    )[0].allowed,
  ).toBe(false);
  await db.exec("set local role service_role");
  expect((await tick())[0].result.chat).toBe(false);
});
it("reuses the claimed source's legacy transcript and does not touch unrelated jobs", async () => {
  await addRecording();
  await addRecording(11);
  await db.exec(`insert into test_response_transcripts(id,test_response_id,provider,model,status,full_text,completed_at)
    values('${id(40)}','${id(10)}','groq','whisper','completed','Retained text',now());`);
  const jobs = await rows("select * from claim_recording_transcripts(2)");
  const job = jobs.find((item) => item.response_id === id(10))!;
  expect(
    (
      await rows("select reuse_claimed_recording_transcript($1,$2) reused", [
        job.id,
        job.attempt_id,
      ])
    )[0].reused,
  ).toBe(true);
  expect(
    (await rows("select status from recording_transcripts where response_id=$1", [id(11)]))[0]
      .status,
  ).toBe("processing");
  expect(
    (
      await rows("select reuse_claimed_recording_transcript($1,$2) reused", [
        job.id,
        job.attempt_id,
      ])
    )[0].reused,
  ).toBe(false);
});
it("does not reuse text older than the uploaded source", async () => {
  await addRecording();
  await db.exec(`insert into test_response_transcripts(id,test_response_id,provider,model,status,full_text,completed_at)
    values('${id(40)}','${id(10)}','groq','whisper','completed','Stale text',now()-interval '1 day');`);
  const [job] = await rows("select * from claim_recording_transcripts(2)");
  expect(
    (
      await rows("select reuse_claimed_recording_transcript($1,$2) reused", [
        job.id,
        job.attempt_id,
      ])
    )[0].reused,
  ).toBe(false);
});

it("checks versioned sources and rejects legacy text belonging to a newer recording", async () => {
  await addRecording();
  await db.exec(`alter table recording_transcripts add column version_id uuid;
    create table test_response_versions(id uuid primary key,response_id uuid,version_number integer,
      recording_bucket text,recording_path text,recording_deleted_at timestamptz,
      recording_uploaded_at timestamptz,submitted_at timestamptz);
    insert into test_response_versions values('${id(50)}','${id(10)}',1,'r2:recordings','10.webm',null,now(),now());
    update recording_transcripts set version_id='${id(50)}';
    insert into test_response_transcripts(id,test_response_id,provider,model,status,full_text,completed_at)
      values('${id(40)}','${id(10)}','groq','whisper','completed','Version one',now());`);
  const [job] = await rows("select * from claim_recording_transcripts(2)");
  await db.exec(
    `insert into test_response_versions values('${id(51)}','${id(10)}',2,'r2:recordings','new.webm',null,now(),now());`,
  );
  expect(
    (
      await rows("select reuse_claimed_recording_transcript($1,$2) reused", [
        job.id,
        job.attempt_id,
      ])
    )[0].reused,
  ).toBe(false);
  await db.exec(`delete from test_response_versions where id='${id(51)}'`);
  expect(
    (
      await rows("select reuse_claimed_recording_transcript($1,$2) reused", [
        job.id,
        job.attempt_id,
      ])
    )[0].reused,
  ).toBe(true);
});

async function addCronFixture() {
  await db.exec(`create table cron.job(jobid bigint primary key,jobname text,schedule text,active boolean);
    insert into cron.job values
      (1,'dispatch-recording-transcripts','* * * * *',true),
      (2,'dispatch-recording-clips','* * * * *',true),
      (3,'dispatch-chat-notifications','* * * * *',true),
      (4,'send-test-back-reminders-hourly','0 * * * *',true);
    create function cron.alter_job(p_jobid bigint,active boolean) returns void language sql as
      $$ update cron.job j set active=$2 where j.jobid=$1 $$;`);
}

it("blocks cutover until both replacement paths have recent successful checks", async () => {
  await addCronFixture();
  await expect(migration("20261006152321_activate_external_background_scheduler")).rejects.toThrow(
    "Verify external recovery and maintenance",
  );
});

it("disables only the three replaced schedules after verified cutover", async () => {
  await addCronFixture();
  await tick();
  await tick("maintain");
  await migration("20261006152321_activate_external_background_scheduler");
  expect(await rows("select jobname from cron.job where active")).toEqual([
    { jobname: "send-test-back-reminders-hourly" },
  ]);
});
