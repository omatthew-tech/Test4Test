// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("durable transcript migration", () => {
  let db: PGlite;
  const id = (n: number) => `91000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  beforeAll(async () => {
    db = new PGlite();
    // Minimal existing Supabase contracts; all transcript SQL below is the actual migration.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade);
      create table public.submissions(id uuid primary key, user_id uuid references public.profiles(id) on delete cascade,
        product_name text, description text default '', target_audience text default '', instruction_steps text[] default '{}', instructions text default '');
      create table public.test_responses(id uuid primary key, submission_id uuid references public.submissions(id) on delete cascade,
        recording_bucket text, recording_path text, recording_deleted_at timestamptz, recording_uploaded_at timestamptz default now(), submitted_at timestamptz default now(), duration_seconds integer default 60);
      create table public.test_response_transcripts(id uuid primary key, test_response_id uuid references public.test_responses(id) on delete cascade,
        provider text, model text, status text, language text, duration_ms bigint, full_text text, completed_at timestamptz);
      create table public.test_response_transcript_segments(id uuid primary key, transcript_id uuid references public.test_response_transcripts(id) on delete cascade,
        segment_index integer, start_ms bigint, end_ms bigint, text text, words jsonb);
      grant all on public.profiles, public.submissions, public.test_responses to service_role;
      grant select on public.submissions, public.test_responses to authenticated;
      alter table public.submissions enable row level security;
      create policy owner_read on public.submissions for select to authenticated using(user_id = auth.uid());
      alter table public.test_responses enable row level security;
      create policy owner_read on public.test_responses for select to authenticated using(exists(select 1 from public.submissions s where s.id = submission_id));
    `);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260909011828_recording_transcript_reports.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260909012639_reuse_existing_recording_transcripts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260909014325_fix_transcript_report_app_context.sql",
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
    await db.exec(`begin;
      insert into auth.users values ('${id(1)}'), ('${id(2)}');
      insert into public.profiles select id from auth.users;
      insert into public.submissions(id, user_id, product_name, instruction_steps) values
        ('${id(11)}', '${id(1)}', 'One app', array['Find the save button']),
        ('${id(12)}', '${id(2)}', 'Other owner', array['Browse']);
    `);
  });
  afterEach(async () => {
    await db.exec("rollback; reset role;");
  });

  it("reads both structured tasks and the hosted legacy instructions schema", async () => {
    await addRecording(20);
    const readContext = () =>
      db.query<{ report: { app: { instructionSteps: string[] } } }>(
        "select public.get_transcript_report_page($1,$2) as report",
        [id(1), id(11)],
      );
    expect((await readContext()).rows[0].report.app.instructionSteps).toEqual([
      "Find the save button",
    ]);
    await db.exec("alter table public.submissions drop column instruction_steps");
    const original = "1. Explore the app.\n2. Tell us what you think. Café 日本語";
    await db.query("update public.submissions set instructions=$1 where id=$2", [original, id(11)]);
    expect((await readContext()).rows[0].report.app.instructionSteps).toEqual([original]);
  });

  const addRecording = (n: number, app = 11) =>
    db.query(
      "insert into public.test_responses(id, submission_id, recording_bucket, recording_path) values ($1, $2, 'r2:recordings', $3)",
      [id(n), id(app), `recordings/${n}.webm`],
    );
  const claim = () =>
    db.query<{ response_id: string; attempt_id: string; status: string; attempt_count: number }>(
      "select * from public.claim_recording_transcripts(4)",
    );
  const sample = {
    provider: "groq",
    model: "whisper-large-v3-turbo",
    language: "en",
    durationMs: 60000,
    fullText: "Save this.",
    segments: [
      {
        startMs: 100,
        endMs: 900,
        text: "Save this.",
        words: [
          { word: "Save", startMs: 100, endMs: 300 },
          { word: "this.", startMs: 400, endMs: 900 },
        ],
      },
    ],
  };
  async function addLegacy(n: number) {
    await db.query(
      "insert into public.test_response_transcripts(id, test_response_id, provider, model, status, full_text, completed_at) values($1,$2,'groq','whisper-large-v3-turbo','completed','Save this.',now())",
      [id(n + 1000), id(n)],
    );
    await db.query(
      "insert into public.test_response_transcript_segments values($1,$2,0,100,900,'Save this.',$3::jsonb)",
      [id(n + 2000), id(n + 1000), JSON.stringify(sample.segments[0].words)],
    );
  }
  const reuseLegacy = () =>
    db.query<{ count: number }>("select public.reuse_existing_recording_transcripts(25,$1) count", [
      id(1),
    ]);

  it("reuses valid existing transcripts and timed words once without processing media", async () => {
    await addRecording(20);
    await addLegacy(20);
    expect((await reuseLegacy()).rows[0].count).toBe(1);
    expect((await reuseLegacy()).rows[0].count).toBe(0);
    const row = (await db.query("select status, full_text from public.recording_transcripts"))
      .rows[0];
    expect(row).toEqual({ status: "ready", full_text: "Save this." });
    expect(
      (await db.query("select text from public.transcript_words order by sequence")).rows,
    ).toEqual([{ text: "Save" }, { text: "this." }]);
  });

  it("does not reuse a transcript older than the current source", async () => {
    await addRecording(20);
    await addLegacy(20);
    await db.query(
      "update public.test_responses set recording_uploaded_at=now()+interval '1 hour', recording_path='replacement.webm' where id=$1",
      [id(20)],
    );
    expect((await reuseLegacy()).rows[0].count).toBe(0);
    expect((await claim()).rows[0].status).toBe("processing");
  });

  it("scopes legacy reuse to its owner and leaves active attempts untouched", async () => {
    await addRecording(20);
    await addRecording(21, 12);
    await addLegacy(20);
    await addLegacy(21);
    await claim();
    expect((await reuseLegacy()).rows[0].count).toBe(0);
    await db.query(
      "update public.recording_transcripts set status='pending',attempt_count=0,attempt_id=null",
    );
    expect((await reuseLegacy()).rows[0].count).toBe(1);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.recording_transcripts where response_id=$1",
          [id(21)],
        )
      ).rows[0].status,
    ).toBe("pending");
    await forbidden(
      "authenticated",
      `select public.reuse_existing_recording_transcripts(25,'${id(1)}')`,
    );
  });
  async function finish(
    responseId: string,
    attemptId: string,
    event = "completed",
    result: unknown = sample,
  ) {
    return (
      await db.query<{ accepted: boolean }>(
        "select public.finish_recording_transcript($1, $2, $3, $4::jsonb) as accepted",
        [responseId, attemptId, event, JSON.stringify(result)],
      )
    ).rows[0].accepted;
  }
  async function forbidden(role: string, sql: string) {
    await db.exec(`savepoint permission_check; set role ${role};`);
    await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to savepoint permission_check;");
  }

  it("automatically creates one pending job only when a response has a source", async () => {
    await db.query("insert into public.test_responses(id, submission_id) values ($1, $2)", [
      id(20),
      id(11),
    ]);
    expect((await claim()).rows).toHaveLength(0);
    await db.query(
      "update public.test_responses set recording_bucket='r2:recordings', recording_path='one.webm' where id=$1",
      [id(20)],
    );
    await db.query("update public.test_responses set recording_path='one.webm' where id=$1", [
      id(20),
    ]);
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("persists text and ordered words transactionally and ignores duplicate completions", async () => {
    await addRecording(20);
    await db.exec("set role service_role");
    const job = (await claim()).rows[0];
    expect(await finish(job.response_id, job.attempt_id)).toBe(true);
    expect(await finish(job.response_id, job.attempt_id)).toBe(false);
    expect(
      (await db.query("select full_text, status from public.recording_transcripts")).rows,
    ).toEqual([{ full_text: "Save this.", status: "ready" }]);
    expect(
      (await db.query("select sequence, text from public.transcript_words order by sequence")).rows,
    ).toEqual([
      { sequence: 0, text: "Save" },
      { sequence: 1, text: "this." },
    ]);
  });

  it("restricts RPCs, row reads, and writes to the intended roles and owner", async () => {
    await addRecording(20);
    await addRecording(21, 12);
    await forbidden("anon", "select full_text from public.recording_transcripts");
    for (const role of ["anon", "authenticated"]) {
      await forbidden(role, "select * from public.claim_recording_transcripts(1)");
      await forbidden(role, `select public.get_transcript_report_page('${id(1)}')`);
      await forbidden(role, "update public.recording_transcripts set status='ready'");
    }
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id(1)]);
    await db.exec("set role authenticated");
    expect((await db.query("select response_id from public.recording_transcripts")).rows).toEqual([
      { response_id: id(20) },
    ]);
  });

  it("recovers a worker restart and rejects the abandoned attempt", async () => {
    await addRecording(20);
    const old = (await claim()).rows[0];
    await db.exec(
      "update public.recording_transcripts set lease_expires_at=now()-interval '1 second'",
    );
    await claim();
    expect(await finish(old.response_id, old.attempt_id)).toBe(false);
    await db.exec("update public.recording_transcripts set retry_after=now()");
    const next = (await claim()).rows[0];
    expect(next.attempt_id).not.toBe(old.attempt_id);
    expect(await finish(next.response_id, next.attempt_id)).toBe(true);
  });

  it("bounds automatic retries and permits only the owner to retry a failed job", async () => {
    await addRecording(20);
    for (let n = 0; n < 3; n++) {
      const job = (await claim()).rows[0];
      await finish(job.response_id, job.attempt_id, "failed", null);
      await db.exec("update public.recording_transcripts set retry_after=now()");
    }
    expect((await claim()).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ retried: boolean }>(
          "select public.retry_recording_transcript($1, $2) as retried",
          [id(2), id(20)],
        )
      ).rows[0].retried,
    ).toBe(false);
    expect(
      (
        await db.query<{ retried: boolean }>(
          "select public.retry_recording_transcript($1, $2) as retried",
          [id(1), id(20)],
        )
      ).rows[0].retried,
    ).toBe(true);
    expect((await claim()).rows).toHaveLength(1);
  });

  it("does not spend the retry budget when the worker queue is full", async () => {
    await addRecording(20);
    const job = (await claim()).rows[0];
    await finish(job.response_id, job.attempt_id, "busy", null);
    expect(
      (await db.query("select status, attempt_count from public.recording_transcripts")).rows,
    ).toEqual([{ status: "pending", attempt_count: 0 }]);
  });

  it("purges text and words when the recording is soft-deleted and rejects late callbacks", async () => {
    await addRecording(20);
    const job = (await claim()).rows[0];
    await finish(job.response_id, job.attempt_id);
    await db.query("update public.test_responses set recording_deleted_at=now() where id=$1", [
      id(20),
    ]);
    expect((await db.query("select * from public.recording_transcripts")).rows).toHaveLength(0);
    expect((await db.query("select * from public.transcript_words")).rows).toHaveLength(0);
    expect(await finish(job.response_id, job.attempt_id)).toBe(false);
    expect((await claim()).rows).toHaveLength(0);
  });

  it("rejects completion after source replacement or deletion during processing", async () => {
    await addRecording(20);
    await addRecording(21);
    const jobs = (await claim()).rows;
    await db.query(
      "update public.test_responses set recording_path='new-source.webm' where id=$1",
      [id(20)],
    );
    await db.query("update public.test_responses set recording_deleted_at=now() where id=$1", [
      id(21),
    ]);
    for (const job of jobs) expect(await finish(job.response_id, job.attempt_id)).toBe(false);
    expect((await claim()).rows.map((job) => job.response_id)).toEqual([id(20)]);
  });

  it("cascades transcript deletion through account deletion", async () => {
    await addRecording(20);
    const job = (await claim()).rows[0];
    await finish(job.response_id, job.attempt_id);
    await db.query("delete from auth.users where id=$1", [id(1)]);
    expect((await db.query("select * from public.transcript_words")).rows).toHaveLength(0);
    expect(await finish(job.response_id, job.attempt_id)).toBe(false);
  });

  it("backfills retained sources in bounded batches", async () => {
    await db.exec(
      "alter table public.test_responses disable trigger sync_recording_transcript_after_save",
    );
    for (let n = 100; n < 130; n++) await addRecording(n);
    await db.exec(
      "alter table public.test_responses enable trigger sync_recording_transcript_after_save",
    );
    await claim();
    expect((await db.query("select * from public.recording_transcripts")).rows).toHaveLength(25);
    await claim();
    expect((await db.query("select * from public.recording_transcripts")).rows).toHaveLength(30);
  });

  it("returns complete keyset pages beyond 100 recordings without mixing owners or leaking source paths", async () => {
    for (let n = 100; n < 206; n++) await addRecording(n);
    await addRecording(300, 12);
    const all: string[] = [];
    let time: string | null = null,
      after: string | null = null;
    for (let n = 0; n < 3; n++) {
      const page: {
        apps: Array<{ id: string }>;
        recordings: Array<{ responseId: string; submittedAt: string }>;
      } = (
        await db.query<{
          report: {
            apps: Array<{ id: string }>;
            recordings: Array<{ responseId: string; submittedAt: string }>;
          };
        }>("select public.get_transcript_report_page($1,$2,now(),$3,$4) report", [
          id(1),
          id(11),
          time,
          after,
        ])
      ).rows[0].report;
      expect(page.apps).toHaveLength(1);
      expect(JSON.stringify(page)).not.toContain("recordings/");
      const rows = page.recordings.slice(0, 50);
      all.push(...rows.map((row) => row.responseId));
      time = rows[rows.length - 1]?.submittedAt ?? null;
      after = rows[rows.length - 1]?.responseId ?? null;
    }
    expect(all).toHaveLength(106);
    expect(new Set(all).size).toBe(106);
  });

  it("keeps a successful silent recording exportable", async () => {
    await addRecording(20);
    const job = (await claim()).rows[0];
    expect(
      await finish(job.response_id, job.attempt_id, "completed", {
        ...sample,
        fullText: "",
        segments: [],
      }),
    ).toBe(true);
    expect(
      (await db.query("select status, full_text from public.recording_transcripts")).rows,
    ).toEqual([{ status: "ready", full_text: "" }]);
  });
});
