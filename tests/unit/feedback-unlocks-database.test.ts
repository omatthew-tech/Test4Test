// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `73000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  tester = id(2),
  stranger = id(3),
  app = id(10),
  target = id(11);
const legacy = id(20),
  earned = id(21),
  otherEarned = id(22),
  shared = id(23),
  version = id(30);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    create table profiles(id uuid primary key, ban_status text default 'clear');
    create function public.current_user_has_app_access() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table submissions(id uuid primary key, user_id uuid references profiles(id), status text default 'live',
      is_open_for_more_tests boolean default true, needs_google_play_closed_testers boolean default false,
      promoted boolean default false, response_count integer default 0, created_at timestamptz default now());
    create table test_responses(id uuid primary key default gen_random_uuid(), submission_id uuid references submissions(id),
      submission_version_id uuid, question_set_version_id uuid, tester_user_id uuid,
      anonymous_label text default 'Tester', status text default 'approved', quality_score integer default 90,
      credit_awarded boolean default true, submitted_at timestamptz default now(), duration_seconds integer default 60,
      answers jsonb default '[{"textAnswer":"private answer"}]', internal_flags text[] default '{}',
      recording_bucket text default 'r2:recordings', recording_path text default 'private.webm', recording_deleted_at timestamptz);
    create table test_response_versions(id uuid primary key, response_id uuid references test_responses(id),
      recording_bucket text default 'r2:recordings', recording_path text default 'original.webm', recording_deleted_at timestamptz);
    create table credit_transactions(id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id),
      type text constraint credit_transactions_type_check check(type in ('starter_credit','earned_test','adjustment','revocation')),
      amount integer not null, reason text not null, related_test_response_id uuid references test_responses(id) on delete set null,
      created_at timestamptz default now());
    create table recording_transcripts(id uuid primary key default gen_random_uuid(), response_id uuid references test_responses(id), full_text text);
    alter table test_responses enable row level security;
    alter table test_response_versions enable row level security;
    alter table recording_transcripts enable row level security;
    alter table credit_transactions enable row level security;
    create policy responses_select_related on test_responses for select to authenticated using(true);
    create policy response_versions_read on test_response_versions for select to authenticated using(exists(select 1 from test_responses r where r.id = response_id));
    create policy transcript_owner_read on recording_transcripts for select to authenticated using(exists(select 1 from test_responses r join submissions s on s.id=r.submission_id where r.id=response_id and s.user_id=auth.uid()));
    create policy credits_own on credit_transactions for select to authenticated using(user_id=auth.uid());
    grant select on profiles, submissions, test_responses, test_response_versions, recording_transcripts, credit_transactions to authenticated;
    grant all on all tables in schema public to service_role;
    create function public.get_transcript_report_page(p_owner uuid) returns jsonb language sql stable as $$
      select coalesce(jsonb_agg(t.full_text),'[]') from test_responses r join submissions s on s.id=r.submission_id
      join recording_transcripts t on t.response_id=r.id where s.user_id = p_owner $$;
    revoke all on function public.get_transcript_report_page(uuid) from public;
    grant execute on function public.get_transcript_report_page(uuid) to service_role;
    create function public.submit_test_response_with_attribution(uuid,jsonb,integer,text,text,uuid,uuid,uuid)
    returns jsonb language plpgsql as $$ declare v_id uuid; begin
      insert into public.test_responses(submission_id,tester_user_id) values($1,auth.uid()) returning id into v_id;
      return jsonb_build_object('responseId',v_id); end $$;
    insert into profiles(id) values('${owner}'),('${tester}'),('${stranger}');
    insert into submissions(id,user_id) values('${app}','${owner}'),('${target}','${tester}');
    insert into test_responses(id,submission_id,tester_user_id) values('${legacy}','${app}','${tester}');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260922201543_earned_feedback_credit_unlocks.sql",
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
  await db.exec(`reset role; delete from recording_transcripts; delete from test_response_versions;
    delete from credit_transactions; delete from test_responses where id <> '${legacy}';
    update submissions set is_open_for_more_tests=true;
    select set_config('test4test.feedback_source','earn',false);
    insert into test_responses(id,submission_id,tester_user_id) values('${earned}','${app}','${tester}'),('${otherEarned}','${app}','${tester}');
    select set_config('test4test.feedback_source','shared_link',false);
    insert into test_responses(id,submission_id,tester_user_id) values('${shared}','${app}','${tester}');
    insert into test_response_versions(id,response_id) values('${version}','${earned}');
    insert into recording_transcripts(response_id,full_text) values('${earned}','locked text'),('${shared}','free text');
    select set_config('request.jwt.claim.sub','${owner}',false);`);
});
async function balance(amount: number) {
  await db.query(
    "insert into credit_transactions(user_id,type,amount,reason) values($1,'adjustment',$2,'Test balance')",
    [owner, amount],
  );
}
async function open(responseId = earned, versionId: string | null = null) {
  const result = await db.query<{
    result: { status: string; balance?: number; testBackSubmissionId?: string };
  }>("select public.open_received_feedback($1,$2) as result", [responseId, versionId]);
  return result.rows[0].result;
}
async function debitCount() {
  return (
    await db.query<{ count: number }>(
      "select count(*)::integer as count from credit_transactions where type='feedback_unlock'",
    )
  ).rows[0].count;
}

describe("one-time feedback credit unlocks", () => {
  it.each([0, -1])(
    "blocks a balance of %i without a debit and returns the reciprocal target",
    async (amount) => {
      await balance(amount);
      expect(await open()).toMatchObject({
        status: "insufficient_credits",
        balance: amount,
        testBackSubmissionId: target,
      });
      expect(await debitCount()).toBe(0);
    },
  );
  it("spends the last credit once, including repeated and versioned opens", async () => {
    await balance(1);
    expect(await open()).toMatchObject({ status: "unlocked", balance: 0 });
    expect(await open()).toMatchObject({ status: "unlocked", balance: 0 });
    expect(await open(earned, version)).toMatchObject({ status: "unlocked", balance: 0 });
    expect(await open(otherEarned)).toMatchObject({ status: "insufficient_credits" });
    expect(await debitCount()).toBe(1);
  });
  it("deduplicates overlapping requests for the same response", async () => {
    await balance(1);
    expect((await Promise.all([open(), open(), open()])).map((r) => r.status)).toEqual([
      "unlocked",
      "unlocked",
      "unlocked",
    ]);
    expect(await debitCount()).toBe(1);
  });
  it("allows only one of two different responses to use the last credit", async () => {
    await balance(1);
    const results = await Promise.all([open(), open(otherEarned)]);
    expect(results.map((r) => r.status).sort()).toEqual(["insufficient_credits", "unlocked"]);
    expect(await debitCount()).toBe(1);
  });
  it("keeps legacy and signed-in shared-link feedback free at zero", async () => {
    expect(await open(legacy)).toMatchObject({ status: "free", balance: 0 });
    expect(await open(shared)).toMatchObject({ status: "free", balance: 0 });
    expect(await debitCount()).toBe(0);
  });
  it("does not charge for a foreign, missing, deleted, or invalid-version recording", async () => {
    await balance(4);
    expect(await open(id(99))).toMatchObject({ status: "unavailable" });
    expect(await open(earned, id(99))).toMatchObject({ status: "unavailable" });
    await db.query("update test_responses set recording_deleted_at=now() where id=$1", [earned]);
    expect(await open()).toMatchObject({ status: "unavailable" });
    await db.exec(`select set_config('request.jwt.claim.sub','${stranger}',false)`);
    await expect(open(shared)).rejects.toThrow("You do not have permission");
    expect(await debitCount()).toBe(0);
  });
  it("omits an unavailable test-back target", async () => {
    await db.query("update submissions set is_open_for_more_tests=false where id=$1", [target]);
    expect(await open()).toMatchObject({
      status: "insufficient_credits",
      testBackSubmissionId: null,
    });
  });
  it("supports a deployed backend without recording versions", async () => {
    await balance(1);
    await db.exec("begin; drop table test_response_versions");
    try {
      expect(await open(earned, version)).toMatchObject({ status: "unavailable" });
      expect(await debitCount()).toBe(0);
      expect(await open()).toMatchObject({ status: "unlocked", balance: 0 });
    } finally {
      await db.exec("rollback");
    }
  });
  it("stamps source in the submission operation and rejects subsequent changes", async () => {
    await db.exec(`select set_config('request.jwt.claim.sub','${tester}',false)`);
    const submitted = await db.query<{ result: { responseId: string } }>(
      "select public.submit_test_response_from_source($1,'[]',60,null,null,null,null,null,'earn') as result",
      [app],
    );
    const source = await db.query<{ feedback_source: string }>(
      "select feedback_source from test_responses where id=$1",
      [submitted.rows[0].result.responseId],
    );
    expect(source.rows[0].feedback_source).toBe("earn");
    await expect(
      db.query("update test_responses set feedback_source='shared_link' where id=$1", [earned]),
    ).rejects.toThrow("cannot be changed");
  });
  it("redacts summaries and denies direct rows, history, transcripts and service-role reports until unlocked", async () => {
    await balance(1);
    await db.exec("set role authenticated");
    const summary = await db.query<{
      row: { id: string; feedback_access: string; recording_path?: string; answers: unknown[] };
    }>("select public.list_received_feedback() as row");
    const locked = summary.rows.find((r) => r.row.id === earned)!.row;
    expect(locked).toMatchObject({ feedback_access: "locked", answers: [] });
    expect(locked.recording_path).toBeUndefined();
    expect((await db.query("select * from test_responses where id=$1", [earned])).rows).toEqual([]);
    expect(
      (await db.query("select * from test_response_versions where response_id=$1", [earned])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from recording_transcripts where response_id=$1", [earned])).rows,
    ).toEqual([]);
    await db.exec("reset role; set role service_role");
    expect(
      (
        await db.query<{ report: string[] }>("select get_transcript_report_page($1) as report", [
          owner,
        ])
      ).rows[0].report,
    ).toEqual(["free text"]);
    await db.exec("reset role; set role authenticated");
    await open();
    expect(
      (await db.query("select * from test_responses where id=$1", [earned])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from test_response_versions where response_id=$1", [earned])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from recording_transcripts where response_id=$1", [earned])).rows,
    ).toHaveLength(1);
  });
  it("keeps testers' own rows accessible and denies anonymous operations", async () => {
    await db.exec(
      `select set_config('request.jwt.claim.sub','${tester}',false); set role authenticated`,
    );
    expect(
      (await db.query("select * from test_responses where id=$1", [earned])).rows,
    ).toHaveLength(1);
    await expect(open()).rejects.toThrow("You do not have permission");
    await db.exec("reset role; set role anon");
    await expect(open()).rejects.toThrow(/permission denied/);
  });
});
