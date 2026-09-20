// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001";
const tester = "10000000-0000-4000-8000-000000000002";
const response = "20000000-0000-4000-8000-000000000001";
const version = "30000000-0000-4000-8000-000000000001";
const clip = "40000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
describe.each([false, true])("recording versions installed: %s", (hasVersions) => {
  type ClipRow = {
    id: string;
    attempt_id: string;
    status: string;
    output_path: string | null;
    attempts: number;
  };
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.submissions(id uuid primary key, user_id uuid);
    create table public.test_responses(id uuid primary key, submission_id uuid references submissions(id), tester_user_id uuid,
      recording_bucket text, recording_path text, recording_deleted_at timestamptz);
    grant select on submissions, test_responses to service_role;`);
    if (hasVersions)
      await db.exec(`create table public.test_response_versions(id uuid primary key, response_id uuid references test_responses(id) on delete cascade,
    recording_bucket text, recording_path text, recording_deleted_at timestamptz);
    grant select on test_response_versions to service_role;`);
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/20260920185754_recording_clips.sql", import.meta.url),
        "utf8",
      ),
    );
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(`truncate recording_clip_assets, recording_clips, test_responses, submissions, auth.users cascade;
    insert into auth.users values ('${owner}'), ('${tester}');
    insert into submissions values ('${owner}', '${owner}');
    insert into test_responses values ('${response}', '${owner}', '${tester}', 'r2:recordings', 'current.webm', null);`);
    if (hasVersions)
      await db.exec(
        `insert into test_response_versions values ('${version}', '${response}', 'r2:recordings', 'old.webm', null);`,
      );
  });
  async function create(
    id = clip,
    user = owner,
    versionId: string | null = null,
    start = 12300,
    end = 30400,
  ) {
    return db.query<ClipRow>("select * from create_recording_clip($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      id,
      response,
      versionId,
      user,
      "r2:recordings",
      versionId ? "old.webm" : "current.webm",
      start,
      end,
      id === clip ? hash : id.replace(/-/g, "").repeat(2),
    ]);
  }
  async function claim() {
    return (await db.query<ClipRow>("select * from claim_recording_clips()")).rows[0];
  }
  async function finish(attempt: string, event: string) {
    return (
      await db.query<{ accepted: boolean }>("select finish_recording_clip($1,$2,$3) as accepted", [
        clip,
        attempt,
        event,
      ])
    ).rows[0].accepted;
  }
  it("restricts tables and job functions to the service role, including future grants", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ readable: boolean; callable: boolean; rls: boolean }>(
        `
      select has_table_privilege($1, 'recording_clips', 'SELECT') as readable,
      has_function_privilege($1, 'claim_recording_clips(integer,uuid)', 'EXECUTE') as callable,
      (select relrowsecurity from pg_class where oid = 'recording_clips'::regclass) as rls`,
        [role],
      );
      expect(rows[0]).toEqual({ readable: false, callable: false, rls: true });
    }
    await db.exec("set role service_role");
    try {
      expect((await create()).rows[0].status).toBe("pending");
    } finally {
      await db.exec("reset role");
    }
  });
  it("creates idempotently, rejects changed requests, unauthorized creators, and inverted ranges", async () => {
    await create();
    await create();
    expect((await db.query("select * from recording_clips")).rows).toHaveLength(1);
    await expect(create(clip, owner, null, 0, 5000)).rejects.toThrow("conflict");
    await expect(
      create("40000000-0000-4000-8000-000000000009", "10000000-0000-4000-8000-000000000009"),
    ).rejects.toThrow();
    await expect(
      create("40000000-0000-4000-8000-000000000008", owner, null, 5000, 1000),
    ).rejects.toThrow();
  });
  it("claims each job once and acknowledges duplicate completions without exposing source media", async () => {
    await create();
    const job = await claim();
    expect(job.status).toBe("processing");
    expect(await claim()).toBeUndefined();
    expect(await finish(job.attempt_id, "completed")).toBe(true);
    expect(await finish(job.attempt_id, "completed")).toBe(true);
    const row = (await db.query<ClipRow>("select * from recording_clips")).rows[0];
    expect(row.output_path).toBe(`recording-clips/${clip}/${job.attempt_id}.mp4`);
    expect(await finish("50000000-0000-4000-8000-000000000001", "completed")).toBe(false);
  });
  it("retries expired leases, fences stale completions, and stops after three failures", async () => {
    await create();
    const first = await claim();
    await db.exec("update recording_clips set lease_expires_at = now() - interval '1 minute'");
    const second = await claim();
    expect(second.attempt_id).not.toBe(first.attempt_id);
    expect(await finish(first.attempt_id, "completed")).toBe(false);
    await finish(second.attempt_id, "failed");
    await db.exec("update recording_clips set retry_after = now()");
    const third = await claim();
    await finish(third.attempt_id, "failed");
    expect((await db.query<ClipRow>("select * from recording_clips")).rows[0].status).toBe(
      "failed",
    );
    expect(await claim()).toBeUndefined();
  });
  it("revokes clips on source replacement but retains clips tied to an unchanged historical version", async () => {
    await create();
    if (!hasVersions) {
      await expect(create("40000000-0000-4000-8000-000000000002", owner, version)).rejects.toThrow(
        "Recording unavailable",
      );
      await db.exec("update test_responses set recording_path = 'replacement.webm'");
      expect((await db.query("select * from recording_clips")).rows).toHaveLength(0);
      return;
    }
    await create("40000000-0000-4000-8000-000000000002", owner, version);
    await db.exec("update test_responses set recording_path = 'replacement.webm'");
    const { rows } = await db.query<{ version_id: string }>(
      "select version_id from recording_clips",
    );
    expect(rows).toEqual([{ version_id: version }]);
    await db.exec("update test_response_versions set recording_deleted_at = now()");
    expect((await db.query("select * from recording_clips")).rows).toHaveLength(0);
  });
  it("cascades deletion while retaining a cleanup ledger, and never cleans the active output", async () => {
    await create();
    const job = await claim();
    await finish(job.attempt_id, "completed");
    await db.exec("update recording_clip_assets set created_at = now() - interval '2 hours'");
    expect((await db.query("select * from recording_clip_garbage()")).rows).toHaveLength(0);
    await db.exec("delete from test_responses");
    expect((await db.query("select * from recording_clip_garbage()")).rows).toHaveLength(1);
    expect(await finish(job.attempt_id, "completed")).toBe(false);
  });
  it("bounds concurrent exports per creator", async () => {
    for (let i = 1; i <= 3; i++) await create(`40000000-0000-4000-8000-00000000000${i}`);
    await expect(create("40000000-0000-4000-8000-000000000004")).rejects.toThrow("limit");
  });

  it("applies the same quota to retries and never resets the total attempt limit", async () => {
    await create();
    await db.exec("update recording_clips set status = 'failed', attempts = 3");
    for (let i = 2; i <= 4; i++) await create(`40000000-0000-4000-8000-00000000000${i}`);
    await expect(db.query("select retry_recording_clip($1, $2)", [clip, owner])).rejects.toThrow(
      "limit",
    );
    await db.query("delete from recording_clips where id <> $1", [clip]);
    const result = await db.query<ClipRow>("select * from retry_recording_clip($1, $2)", [
      clip,
      owner,
    ]);
    expect(result.rows[0].status).toBe("pending");
    expect(result.rows[0].attempts).toBe(3);
    await db.exec("update recording_clips set status = 'failed', attempts = 6");
    await expect(db.query("select retry_recording_clip($1, $2)", [clip, owner])).rejects.toThrow(
      "retry limit",
    );
  });
  it.skipIf(hasVersions)(
    "attaches version deletion guards when versioning is deployed later",
    async () => {
      await db.exec(`create table public.test_response_versions(id uuid primary key, response_id uuid references test_responses(id) on delete cascade,
      recording_bucket text, recording_path text, recording_deleted_at timestamptz);
      grant select on test_response_versions to service_role;
      insert into test_response_versions values ('${version}', '${response}', 'r2:recordings', 'old.webm', null);`);
      const versionMigration = await readFile(
        new URL(
          "../../supabase/migrations/20260911183111_recording_only_versioned_feedback.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const guards = versionMigration.slice(
        versionMigration.indexOf("-- A legacy deployment may have enabled clipping"),
      );
      expect(guards).toContain("recording_clips_version_id_fkey");
      await db.exec(guards);
      await create(clip, owner, version);
      await db.exec("delete from test_response_versions");
      expect((await db.query("select * from recording_clips")).rows).toHaveLength(0);
    },
  );
});
