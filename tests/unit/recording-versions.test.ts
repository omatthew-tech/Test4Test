// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `92000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = async (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const functionSQL = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};

describe("recording-only submissions and versioned revisions", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      create table public.profiles(id uuid primary key, clear boolean default true);
      create function public.current_user_has_app_access() returns boolean language sql stable as $$ select exists(select 1 from public.profiles where id=auth.uid() and clear) $$;
      create function public.profile_is_clear(uuid) returns boolean language sql stable as $$ select coalesce((select clear from public.profiles where id=$1),false) $$;
      create table public.submissions(id uuid primary key, user_id uuid references public.profiles(id) on delete cascade,
        status text default 'live', requires_recording boolean not null default false, product_name text default 'App', description text default '',
        target_audience text default '', instruction_steps text[] default '{}', instructions text default '', response_count integer default 0, last_response_at timestamptz);
      create table public.submission_versions(id uuid primary key, submission_id uuid references public.submissions(id), version_number integer default 1, is_active boolean default true);
      create table public.question_set_versions(id uuid primary key, submission_id uuid references public.submissions(id), version_number integer default 1, is_active boolean default true, questions jsonb default '[]');
      create table public.test_responses(id uuid primary key default gen_random_uuid(), submission_id uuid references public.submissions(id) on delete cascade,
        submission_version_id uuid, question_set_version_id uuid, tester_user_id uuid references public.profiles(id) on delete cascade, public_tester_key text,
        anonymous_label text, status text default 'approved', quality_score integer default 90, credit_awarded boolean default true,
        submitted_at timestamptz default now(), duration_seconds integer default 200, answers jsonb default '[]', internal_flags text[] default '{}',
        recording_bucket text, recording_path text, recording_file_name text, recording_mime_type text, recording_file_size_bytes bigint,
        recording_uploaded_at timestamptz default now(), recording_expires_at timestamptz, recording_deleted_at timestamptz,
        recording_thumbnail_bucket text, recording_thumbnail_path text, unique(submission_id,tester_user_id));
      create table public.test_response_recording_uploads(id uuid primary key default gen_random_uuid(), storage_provider text default 'r2', storage_bucket text,
        object_key text, tester_user_id uuid references public.profiles(id) on delete cascade, public_tester_key text, status text default 'completed',
        file_name text default 'recording.webm', mime_type text default 'video/webm', file_size_bytes bigint default 1000,
        uploaded_at timestamptz default now(), updated_at timestamptz default now(), expires_at timestamptz,
        thumbnail_storage_bucket text, thumbnail_path text, attached_response_id uuid references public.test_responses(id) on delete set null);
      create table public.feedback_ratings(id uuid primary key default gen_random_uuid(), test_response_id uuid references public.test_responses(id) on delete cascade,
        rated_by_user_id uuid, rating_value text);
      create table public.feedback_rating_reports(id uuid primary key default gen_random_uuid(), test_response_id uuid references public.test_responses(id), status text);
      create table public.test_response_drafts(submission_id uuid,tester_user_id uuid);
      create table public.credit_transactions(id uuid primary key default gen_random_uuid(), user_id uuid,type text,amount integer,reason text,related_test_response_id uuid);
      create table storage.objects(owner uuid, metadata jsonb, created_at timestamptz,bucket_id text,name text);
      create table public.test_response_transcripts(id uuid primary key, test_response_id uuid references public.test_responses(id) on delete cascade,
        provider text,model text,status text,language text,duration_ms bigint,full_text text,completed_at timestamptz);
      create table public.test_response_transcript_segments(transcript_id uuid,segment_index integer,start_ms bigint,end_ms bigint,text text,words jsonb);
      create function public.revise_test_response(uuid,jsonb,integer) returns jsonb language sql as $$ select '{}'::jsonb $$;
      grant select on public.profiles, public.submissions, public.test_responses to authenticated;
      grant all on all tables in schema public to service_role;
      insert into public.profiles(id) values ('${id(1)}'),('${id(2)}'),('${id(3)}');
      insert into public.submissions(id,user_id) values ('${id(11)}','${id(1)}');
      insert into public.submission_versions(id,submission_id) values ('${id(21)}','${id(11)}');
      insert into public.question_set_versions(id,submission_id,questions) values ('${id(31)}','${id(11)}','[{"title":"Legacy question","type":"paragraph"}]');
      insert into public.test_responses(id,submission_id,tester_user_id,submission_version_id,question_set_version_id,answers,recording_bucket,recording_path)
      values ('${id(41)}','${id(11)}','${id(2)}','${id(21)}','${id(31)}','[{"questionId":"old","textAnswer":"Keep my original feedback"}]','r2:test-response-recordings','original.webm');
    `);
    await db.exec(await migration("20260909011828_recording_transcript_reports"));
    await db.exec(await migration("20260909012639_reuse_existing_recording_transcripts"));
    await db.exec(`
      insert into public.recording_transcripts(id,response_id,owner_user_id,source_bucket,source_path,status,full_text)
      values('${id(61)}','${id(41)}','${id(1)}','r2:test-response-recordings','original.webm','ready','Completed before migration');
      insert into public.transcript_words(id,transcript_id,sequence,segment_index,start_ms,end_ms,text)
      values('${id(62)}','${id(61)}',0,0,0,100,'Completed');
    `);
    await db.exec(
      functionSQL(await migration("20260516_r2_recording_storage"), "submit_test_response"),
    );
    await db.exec(
      functionSQL(
        await migration("20260623_public_shared_recording_tests"),
        "submit_public_test_response",
      ),
    );
    await db.exec(await migration("20260911183111_recording_only_versioned_feedback"));
  }, 30_000);
  afterAll(async () => db?.close());
  beforeEach(async () => {
    await db.exec(`begin; select set_config('request.jwt.claim.sub','${id(2)}',false);
      insert into public.feedback_ratings(test_response_id,rated_by_user_id,rating_value) values ('${id(41)}','${id(1)}','neutral');
      insert into public.test_response_recording_uploads(id,tester_user_id,storage_bucket,object_key)
      values('${id(51)}','${id(2)}','r2:test-response-recordings','draft/${id(2)}/revision.webm');`);
  });
  afterEach(async () => {
    await db.exec("rollback; reset role");
  });
  async function revise(expected = 1) {
    return db.query<{ result: { ok: boolean; versionNumber: number; versionId: string } }>(
      "select public.revise_test_recording($1,'r2:test-response-recordings',$2,220,$3) result",
      [id(41), `draft/${id(2)}/revision.webm`, expected],
    );
  }
  it("backfills historical answers, requires recordings, and retires written revisions", async () => {
    expect(
      (await db.query("select id,full_text,status from public.recording_transcripts")).rows[0],
    ).toEqual({
      id: id(61),
      full_text: "Completed before migration",
      status: "ready",
    });
    expect((await db.query("select id from public.transcript_words")).rows[0]).toEqual({
      id: id(62),
    });
    await db.exec("update public.submissions set requires_recording=false");
    expect(
      (await db.query("select answers from public.test_response_versions")).rows[0],
    ).toMatchObject({ answers: [{ textAnswer: "Keep my original feedback" }] });
    expect(
      (await db.query("select requires_recording from public.submissions")).rows[0],
    ).toMatchObject({ requires_recording: true });
    expect(
      (
        await db.query(
          "select has_function_privilege('authenticated','public.revise_test_response(uuid,jsonb,integer)','execute') allowed",
        )
      ).rows[0],
    ).toMatchObject({ allowed: false });
  });
  it("atomically appends a revision, preserves credits/counts and ratings in history, and retries once", async () => {
    const first = (await revise()).rows[0].result;
    expect(first).toMatchObject({ ok: true, versionNumber: 2 });
    expect((await revise()).rows[0].result.versionId).toBe(first.versionId);
    expect(
      (await db.query("select count(*)::int n from public.test_response_versions")).rows[0],
    ).toEqual({ n: 2 });
    expect(
      (await db.query("select credit_awarded,answers from public.test_responses")).rows[0],
    ).toEqual({ credit_awarded: true, answers: [] });
    expect(
      (await db.query("select count(*)::int n from public.credit_transactions")).rows[0],
    ).toEqual({ n: 0 });
    expect((await db.query("select response_count from public.submissions")).rows[0]).toEqual({
      response_count: 0,
    });
    expect((await db.query("select count(*)::int n from public.feedback_ratings")).rows[0]).toEqual(
      { n: 0 },
    );
    expect(
      (
        await db.query(
          "select jsonb_array_length(rating_snapshot) n from public.test_response_versions where version_number=1",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it.each(["rating", "dispute", "closed", "upload", "author", "conflict"])(
    "rejects invalid revision: %s",
    async (kind) => {
      if (kind === "rating")
        await db.exec("update public.feedback_ratings set rating_value='smiley'");
      if (kind === "dispute")
        await db.exec(
          `insert into public.feedback_rating_reports(test_response_id,status) values('${id(41)}','pending')`,
        );
      if (kind === "closed") await db.exec("update public.submissions set status='paused'");
      if (kind === "upload")
        await db.exec("update public.test_response_recording_uploads set status='uploading'");
      if (kind === "author")
        await db.exec(`select set_config('request.jwt.claim.sub','${id(3)}',false)`);
      const before = (await db.query("select * from public.test_responses")).rows;
      await db.exec("savepoint invalid_revision");
      await expect(revise(kind === "conflict" ? 2 : 1)).rejects.toThrow();
      await db.exec("rollback to savepoint invalid_revision");
      expect((await db.query("select * from public.test_responses")).rows).toEqual(before);
      expect((await db.query("select * from public.test_response_versions")).rows).toHaveLength(1);
    },
  );
  it("keeps old in-flight transcripts valid and returns every version in reports", async () => {
    await db.exec("update public.recording_transcripts set status='pending'");
    const jobs = await db.query<{ response_id: string; attempt_id: string; version_id: string }>(
      "select * from public.claim_recording_transcripts(2)",
    );
    await revise();
    const old = jobs.rows[0];
    expect(
      (
        await db.query(
          "select public.finish_recording_transcript($1,$2,'completed',$3::jsonb) accepted",
          [
            old.response_id,
            old.attempt_id,
            JSON.stringify({
              provider: "test",
              model: "test",
              fullText: "Original words",
              segments: [],
            }),
          ],
        )
      ).rows[0],
    ).toEqual({ accepted: true });
    const report = await db.query<{
      result: {
        recordings: {
          responseId: string;
          versionId: string;
          versionNumber: number;
          fullText: string;
        }[];
      };
    }>("select public.get_transcript_report_page_delta($1) result", [id(1)]);
    expect(report.rows[0].result.recordings).toHaveLength(2);
    expect(new Set(report.rows[0].result.recordings.map((row) => row.versionId)).size).toBe(2);
    expect(report.rows[0].result.recordings.find((row) => row.versionNumber === 1)?.fullText).toBe(
      "Original words",
    );
    const current = (
      await db.query<{ response_id: string; attempt_id: string; version_id: string }>(
        "select * from public.claim_recording_transcripts(2)",
      )
    ).rows[0];
    expect(
      (
        await db.query(
          "select public.finish_recording_transcript($1,$2,'heartbeat',null,$3) accepted",
          [current.response_id, current.attempt_id, old.version_id],
        )
      ).rows[0],
    ).toEqual({ accepted: false });
    expect(
      (
        await db.query(
          "select public.finish_recording_transcript($1,$2,'completed',$3::jsonb,$4) accepted",
          [
            current.response_id,
            current.attempt_id,
            JSON.stringify({
              provider: "test",
              model: "test",
              fullText: "Revised words",
              segments: [],
            }),
            current.version_id,
          ],
        )
      ).rows[0],
    ).toEqual({ accepted: true });
    expect(
      (await db.query("select full_text from public.recording_transcripts order by full_text"))
        .rows,
    ).toEqual([{ full_text: "Original words" }, { full_text: "Revised words" }]);
  });
  it("retries only the chosen failed version and paginates versions of the same response", async () => {
    await revise();
    await db.exec("update public.recording_transcripts set status='failed'");
    expect(
      (
        await db.query("select public.retry_recording_transcript($1,$2,$3) retried", [
          id(1),
          id(41),
          (
            await db.query<{ id: string }>(
              "select id from public.test_response_versions where version_number=1",
            )
          ).rows[0].id,
        ])
      ).rows[0],
    ).toEqual({ retried: true });
    expect(
      (await db.query("select status from public.recording_transcripts order by status")).rows,
    ).toEqual([{ status: "failed" }, { status: "pending" }]);
    await db.exec(`insert into public.test_response_versions(response_id,version_number,submitted_at,duration_seconds,recording_bucket,recording_path)
      select '${id(41)}', n, now(), 200, 'r2:test-response-recordings', 'history/'||n||'.webm' from generate_series(3,55) n`);
    type Page = {
      result: {
        recordings: {
          versionId: string;
          submittedAt: string;
          revision: string;
          unchanged: boolean;
        }[];
      };
    };
    const first = (
      await db.query<Page>("select public.get_transcript_report_page_delta($1) result", [id(1)])
    ).rows[0].result.recordings;
    expect(first).toHaveLength(51);
    const last = first[49];
    const second = (
      await db.query<Page>(
        "select public.get_transcript_report_page_delta($1,null,now(),$2,$3) result",
        [id(1), last.submittedAt, last.versionId],
      )
    ).rows[0].result.recordings;
    expect(second).toHaveLength(5);
    expect(new Set([...first.slice(0, 50), ...second].map((row) => row.versionId)).size).toBe(55);
    const delta = (
      await db.query<Page>(
        "select public.get_transcript_report_page_delta($1,null,now(),null,null,$2::jsonb) result",
        [id(1), JSON.stringify({ [first[0].versionId]: first[0].revision })],
      )
    ).rows[0].result.recordings;
    expect(delta.filter((row) => row.unchanged)).toHaveLength(1);
  });
  it("protects retained legacy files and queues late thumbnails after deletion", async () => {
    const legacyPath = `draft/${id(2)}/original.webm`;
    await db.query(
      "update public.test_response_versions set recording_bucket='test-response-recordings',recording_path=$1 where version_number=1",
      [legacyPath],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,created_at) values('test-response-recordings',$1,now()-interval '2 days')",
      [legacyPath],
    );
    await revise();
    expect(
      (await db.query("select * from public.list_stale_test_response_recording_drafts(100)")).rows,
    ).toHaveLength(0);
    await db.exec("update public.test_responses set recording_deleted_at=now()");
    await db.exec(
      "update public.test_response_versions set thumbnail_bucket='usability-test-screenshots', thumbnail_path='recording-thumbnails/late.webp' where version_number=1",
    );
    expect((await db.query("select * from public.recording_version_deletions")).rows).toHaveLength(
      3,
    );
    expect((await db.query("select * from public.recording_transcripts")).rows).toHaveLength(0);
  });
  it("does not import a response-only transcript completed after a revision into the original", async () => {
    await revise();
    await db.exec("update public.recording_transcripts set status='pending', attempt_count=0");
    await db.exec(`insert into public.test_response_transcripts(id,test_response_id,provider,model,status,full_text,completed_at)
      values('${id(81)}','${id(41)}','test','test','completed','Unknown legacy source',now()+interval '1 second')`);
    expect(
      (await db.query("select public.reuse_existing_recording_transcripts() imported")).rows[0],
    ).toEqual({ imported: 0 });
  });
  it("lets deletion or revision claim an upload only once", async () => {
    await db.exec("update public.test_response_recording_uploads set status='deleted'");
    await db.exec("savepoint deleted_upload");
    await expect(revise()).rejects.toThrow();
    await db.exec("rollback to savepoint deleted_upload");
    expect((await db.query("select * from public.recording_version_deletions")).rows).toHaveLength(
      1,
    );
    await expect(
      db.exec("update public.test_response_recording_uploads set status='completed'"),
    ).rejects.toThrow(/deleted/);
  });
  it("prevents unrelated users reading versions and queues every file on deletion", async () => {
    await revise();
    await db.exec(
      `select set_config('request.jwt.claim.sub','${id(3)}',false); set role authenticated`,
    );
    expect((await db.query("select * from public.test_response_versions")).rows).toHaveLength(0);
    await db.exec("reset role; delete from public.test_responses");
    expect(
      (await db.query("select count(*)::int n from public.recording_version_deletions")).rows[0],
    ).toEqual({ n: 2 });
    expect((await db.query("select * from public.recording_transcripts")).rows).toHaveLength(0);
  });
  it.each([false, true])(
    "accepts empty answers with an uploaded recording (anonymous=%s)",
    async (anonymous) => {
      await db.exec(`select set_config('request.jwt.claim.sub','${anonymous ? "" : id(3)}',false);
      insert into public.test_response_recording_uploads(tester_user_id,public_tester_key,storage_bucket,object_key)
      values(${anonymous ? "null" : `'${id(3)}'`},'public-browser-123456','r2:test-response-recordings','draft/${anonymous ? "public-browser-123456" : id(3)}/new.webm');`);
      const query = anonymous
        ? "select public.submit_public_test_response($1,'[]',200,'public-browser-123456','r2:test-response-recordings',$2) result"
        : "select public.submit_test_response($1,'[]',200,'r2:test-response-recordings',$2) result";
      const result = await db.query<{ result: { ok: boolean } }>(query, [
        id(11),
        `draft/${anonymous ? "public-browser-123456" : id(3)}/new.webm`,
      ]);
      expect(result.rows[0].result.ok).toBe(true);
      expect(
        (await db.query("select * from public.test_responses where cardinality(internal_flags)>0"))
          .rows,
      ).toHaveLength(0);
    },
  );
});
