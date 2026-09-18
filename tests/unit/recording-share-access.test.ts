// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ admin: null as unknown as SupabaseClient }));
vi.mock("../../supabase/functions/_shared/response-recordings.ts", () => ({
  createRecordingAdminClient: () => context.admin,
  getRecordingEnvironment: () => ({}),
  recordingCorsHeaders: {},
  recordingJson: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("../../supabase/functions/_shared/r2-recordings.ts", () => ({
  buildDownloadContentDisposition: vi.fn(),
  createR2PresignedUrl: vi.fn().mockResolvedValue("https://media.example/signed-video.webm"),
  getR2RecordingEnvironment: () => ({ providerBucket: "r2:recordings" }),
  r2Fetch: vi.fn().mockResolvedValue({ ok: true }),
}));

const token = "00000000-0000-4000-8000-000000000001";
const responseId = "00000000-0000-4000-8000-000000000002";
let handler: (request: Request) => Promise<Response>;
let db: PGlite;
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let getUser: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (value: typeof handler) => {
      handler = value;
    },
  });
  // Variable import keeps this Deno entrypoint out of the browser TS compilation.
  const entrypoint = "../../supabase/functions/get-response-recording-access/index.ts";
  await import(entrypoint);
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table test_responses (id uuid primary key); insert into test_responses values ('${responseId}');`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260918190627_recording_share_links.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.close();
});

beforeEach(() => {
  rows = {
    test_responses: [
      {
        id: responseId,
        submission_id: "app",
        tester_user_id: "tester",
        recording_bucket: "r2:recordings",
        recording_path: "video.webm",
        recording_file_name: "video.webm",
        recording_deleted_at: null,
      },
    ],
    submissions: [{ id: "app", user_id: "owner", product_name: "Example app" }],
    recording_share_links: [
      {
        token,
        response_id: responseId,
        recording_bucket: "r2:recordings",
        recording_path: "video.webm",
      },
    ],
  };
  getUser = vi
    .fn()
    .mockImplementation(async (value: string) => ({ data: { user: { id: value } }, error: null }));
  context.admin = {
    auth: { getUser },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        single: async () => ({
          data:
            rows[table]?.find((row) => filters.every(([key, value]) => row[key] === value)) ?? null,
          error: null,
        }),
        maybeSingle: async () => query.single(),
        upsert: async (row: Row) => {
          if (
            !rows[table].some((item) =>
              Object.entries(row).every(([key, value]) => item[key] === value),
            )
          )
            rows[table].push({ ...row, token });
          return { error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
});

function request(body: unknown, user?: string) {
  return handler(
    new Request("https://example.test/access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: `Bearer ${user}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

it("allows token-only guest playback without authenticating or exposing contact data", async () => {
  const result = await request({ shareToken: token });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({
    ok: true,
    url: "https://media.example/signed-video.webm",
    fileName: "video.webm",
    productName: "Example app",
    expiresInSeconds: 300,
  });
  expect(getUser).not.toHaveBeenCalled();
});

it.each([undefined, "unrelated"])("rejects sharing by unauthorized callers: %s", async (user) => {
  expect((await request({ responseId, action: "share" }, user)).status).toBe(user ? 403 : 401);
});

it.each(["owner", "tester"])("creates a stable link after authorizing %s", async (user) => {
  const result = await request({ responseId, action: "share" }, user);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true, shareToken: token });
  expect(getUser).toHaveBeenCalledWith(user);
});

it.each([
  { responseId: "another-recording" },
  { versionId: "old-version" },
  { action: "share" },
  { download: true },
])("does not let a capability select a different resource or operation: %j", async (extra) => {
  expect((await request({ shareToken: token, ...extra })).status).toBe(400);
});

it.each(["bad-token", "00000000-0000-4000-8000-000000000099", null, 123])(
  "rejects unknown or malformed tokens: %s",
  async (shareToken) => {
    expect((await request({ shareToken })).status).toBe(404);
  },
);

it.each([
  { recording_deleted_at: "2026-09-18" },
  { recording_path: "replacement.webm" },
  { recording_bucket: "another-bucket" },
])("invalidates public access when the recording changes: %j", async (change) => {
  Object.assign(rows.test_responses[0], change);
  expect((await request({ shareToken: token })).status).toBe(410);
});

it("continues requiring authentication for private playback", async () => {
  expect((await request({ responseId })).status).toBe(401);
  expect((await request({ responseId }, "unrelated")).status).toBe(403);
  expect((await request({ responseId }, "owner")).status).toBe(200);
});

it("applies the migration with RLS and no client access to share tokens", async () => {
  expect(
    (await db.query("select relrowsecurity from pg_class where relname = 'recording_share_links'"))
      .rows,
  ).toEqual([{ relrowsecurity: true }]);
  for (const role of ["anon", "authenticated"]) {
    for (const permission of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const { rows: privileges } = await db.query(
        "select has_table_privilege($1, 'recording_share_links', $2) allowed",
        [role, permission],
      );
      expect(privileges).toEqual([{ allowed: false }]);
    }
  }
  await db.exec(`set role service_role;
    insert into recording_share_links(response_id,recording_bucket,recording_path) values ('${responseId}','r2:recordings','video.webm');`);
  const result = await db.query<{ token: string }>("select token from recording_share_links");
  expect(result.rows[0].token).toMatch(/^[0-9a-f-]{36}$/);
  await db.exec(`reset role; delete from test_responses where id = '${responseId}';`);
  expect((await db.query("select * from recording_share_links")).rows).toHaveLength(0);
});
