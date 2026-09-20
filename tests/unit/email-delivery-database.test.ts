// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
let migration: string;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;
beforeAll(async () => {
  db = new PGlite();
  migration = await readFile(
    new URL(
      "../../supabase/migrations/20260920182401_repair_existing_email_delivery.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema cron;
    create table cron.job(jobid bigint primary key, jobname text, command text);
    create function cron.alter_job(job_id bigint, command text) returns void language sql as $$
      update cron.job set command=$2 where jobid=$1;
    $$;
    create table email_templates(key text primary key, description text, subject_template text, text_template text, html_template text);
    create table test_back_reminder_sequences(
      id uuid primary key, owner_user_id uuid, tester_user_id uuid, latest_triggering_response_id uuid,
      emails_sent integer, status text, resolved_reason text, last_sent_at timestamptz,
      next_send_at timestamptz not null, resolved_at timestamptz, updated_at timestamptz,
      affects_test_back_rate boolean default false
    );
    create table email_delivery_logs(
      reminder_sequence_id uuid, related_response_id uuid, related_submission_id uuid,
      recipient_user_id uuid, template_key text references email_templates(key), status text, created_at timestamptz
    );
    create table targets(tester_id uuid primary key);
    create table returned(owner_id uuid, tester_id uuid);
    create function has_tested_back(uuid,uuid) returns boolean language sql stable as $$
      select exists(select 1 from returned where owner_id=$1 and tester_id=$2);
    $$;
    create function find_test_back_target_submission(uuid,uuid) returns setof targets language sql stable as $$
      select * from targets where tester_id=$1;
    $$;
    create table google_play_closed_test_participations(
      id uuid primary key, submission_id uuid, tester_user_id uuid, started_on date, status text
    );
    create table google_play_closed_test_check_ins(participation_id uuid, check_in_date date);
    grant usage on schema public to service_role;
    grant select on google_play_closed_test_participations,google_play_closed_test_check_ins,email_delivery_logs to service_role;
  `);
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`truncate test_back_reminder_sequences,email_delivery_logs,email_templates,targets,returned,google_play_closed_test_participations,google_play_closed_test_check_ins,cron.job cascade;
    insert into email_templates(key) values ('test_back_reminder_stage_3');
    insert into cron.job values
      (1,'send-test-back-reminders-hourly',$job$select net.http_post(url := 'https://example.test/send-test-back-reminders', headers := jsonb_build_object('x-reminder-secret','keep-secret-reference'), body := '{}'::jsonb) as request_id;$job$),
      (2,'send-google-play-closed-test-reminders-daily',$job$select net.http_post(url := 'https://example.test/send-google-play-closed-test-reminders', body := '{}'::jsonb) as request_id;$job$);
  `);
});

it("repairs sent and invalid sequences while leaving eligible unsent work queued", async () => {
  await db.exec(`
    insert into test_back_reminder_sequences(id,owner_user_id,tester_user_id,latest_triggering_response_id,emails_sent,status,next_send_at)
    values ('${id(1)}','${id(101)}','${id(201)}','${id(301)}',2,'pending','2026-05-01'),
           ('${id(2)}','${id(102)}','${id(202)}','${id(302)}',1,'pending','2026-05-01'),
           ('${id(3)}','${id(103)}','${id(203)}','${id(303)}',1,'pending','2026-05-01'),
           ('${id(4)}','${id(104)}','${id(204)}','${id(304)}',1,'pending','2026-05-01');
    insert into targets values ('${id(203)}'),('${id(204)}');
    insert into returned values ('${id(104)}','${id(204)}');
    insert into email_delivery_logs(reminder_sequence_id,related_response_id,template_key,status,created_at)
    values ('${id(1)}','${id(301)}','test_back_reminder_stage_3','sent','2026-05-02');
  `);
  await db.exec(migration);
  const result = await rows(
    "select status,resolved_reason,emails_sent,affects_test_back_rate,next_send_at from test_back_reminder_sequences order by id",
  );
  expect(result[0]).toMatchObject({
    status: "resolved",
    resolved_reason: "sequence_complete",
    emails_sent: 3,
    affects_test_back_rate: true,
  });
  expect(result[1]).toMatchObject({
    status: "cancelled",
    resolved_reason: "missing_target_submission",
    affects_test_back_rate: false,
  });
  expect(result[2]).toMatchObject({
    status: "pending",
    emails_sent: 1,
    affects_test_back_rate: false,
  });
  expect(result[3]).toMatchObject({ status: "resolved", resolved_reason: "tested_back" });
  expect(result.every((row) => row.next_send_at !== null)).toBe(true);
  expect(await rows("select * from email_delivery_logs")).toHaveLength(1);
  await db.exec(migration);
  expect(
    await rows(
      "select status,resolved_reason,emails_sent,affects_test_back_rate,next_send_at from test_back_reminder_sequences order by id",
    ),
  ).toEqual(result);
});

it("registers the existing Google Play log key and preserves customized templates", async () => {
  await db.exec(migration);
  await db.exec(
    "insert into email_delivery_logs(template_key,status,created_at) values ('google_play_closed_test_check_in_reminder','sent',now())",
  );
  await db.exec(
    "update email_templates set text_template='Keep this copy' where key='google_play_closed_test_check_in_reminder'",
  );
  await db.exec(migration);
  expect(
    await rows(
      "select text_template from email_templates where key='google_play_closed_test_check_in_reminder'",
    ),
  ).toEqual([{ text_template: "Keep this copy" }]);
});

it("filters checked-in and delivered participants before limiting the daily batch", async () => {
  await db.exec(migration);
  await db.exec(`
    insert into google_play_closed_test_participations values
      ('${id(1)}','${id(11)}','${id(21)}','2026-09-19','active'),
      ('${id(2)}','${id(12)}','${id(22)}','2026-09-19','active'),
      ('${id(3)}','${id(13)}','${id(23)}','2026-09-19','active'),
      ('${id(4)}','${id(14)}','${id(24)}','2026-09-21','active');
    insert into google_play_closed_test_check_ins values ('${id(1)}','2026-09-20');
    insert into email_delivery_logs(related_submission_id,recipient_user_id,template_key,status,created_at)
    values ('${id(12)}','${id(22)}','google_play_closed_test_check_in_reminder','sent','2026-09-20T00:01:00Z');
  `);
  expect(await rows("select id from list_due_google_play_reminders('2026-09-20',1)")).toEqual([
    { id: id(3) },
  ]);
  expect(await rows("select id from list_due_google_play_reminders('2026-09-21',10)")).toHaveLength(
    4,
  );
});

it("restricts the due-participant helper to the service role", async () => {
  await db.exec(migration);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(
      rows("select * from list_due_google_play_reminders('2026-09-20',1)"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await expect(
    rows("select * from list_due_google_play_reminders('2026-09-20',1)"),
  ).resolves.toEqual([]);
  await db.exec("reset role");
});

it("extends only the existing HTTP job timeout and is safe to rerun", async () => {
  await db.exec(migration);
  const first = await rows("select command from cron.job order by jobid");
  expect(String(first[0].command)).toContain("keep-secret-reference");
  for (const row of first) expect(String(row.command)).toContain("timeout_milliseconds := 120000");
  await db.exec(migration);
  expect(await rows("select command from cron.job order by jobid")).toEqual(first);
});
