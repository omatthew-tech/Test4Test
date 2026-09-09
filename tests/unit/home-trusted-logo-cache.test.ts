// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Execute the actual migration against an isolated PostgreSQL engine. Only the
// pre-existing Supabase roles/tables needed by this additive migration are stubbed.
describe("homepage logo cache migration", () => {
  let db: PGlite;
  const id = (index: number) => `90000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema storage;
      create table public.submissions (id uuid primary key);
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      insert into public.submissions (id) values ('${id(1)}'), ('${id(2)}'), ('${id(3)}');
    `);
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/20260908211718_home_trusted_logos.sql", import.meta.url),
        "utf8",
      ),
    );
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });

  async function asRole(role: string, work: () => Promise<void>) {
    await db.exec(`set role ${role}`);
    try {
      await work();
    } finally {
      await db.exec("reset role");
    }
  }

  it("enables RLS and denies visitors cache access and discovery claims", async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.home_trusted_logo_cache'::regclass",
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await asRole(role, async () => {
        await expect(
          db.query("select * from public.home_trusted_logo_cache"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          db.query(
            "insert into public.home_trusted_logo_cache (submission_id, source_key) values ($1, 'bad')",
            [id(1)],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          db.query("select * from public.claim_home_trusted_logo($1, 'bad')", [id(1)]),
        ).rejects.toMatchObject({ code: "42501" });
      });
    }
  });

  it("grants a single atomic lease and permits recovery after it expires", async () => {
    await asRole("service_role", async () => {
      const claim = () =>
        db.query<{ claim_token: string }>(
          "select * from public.claim_home_trusted_logo($1, 'source-one')",
          [id(1)],
        );
      const [first, second] = await Promise.all([claim(), claim()]);
      expect(first.rows).toHaveLength(1);
      expect(second.rows).toHaveLength(0);
      await db.query(
        "update public.home_trusted_logo_cache set lease_expires_at = now() - interval '1 second' where submission_id = $1",
        [id(1)],
      );
      expect((await claim()).rows[0].claim_token).not.toBe(first.rows[0].claim_token);
    });
  });

  it("respects fresh cache TTL, clears branding on destination edits and invalidates older workers", async () => {
    await asRole("service_role", async () => {
      const original = await db.query<{ claim_token: string }>(
        "select * from public.claim_home_trusted_logo($1, 'old-destination')",
        [id(2)],
      );
      await db.query(
        "update public.home_trusted_logo_cache set logo_path = 'old.png', source_image_url = 'https://old.example/icon', refresh_after = now() + interval '7 days', claim_token = null, lease_expires_at = null where submission_id = $1",
        [id(2)],
      );
      expect(
        (
          await db.query("select * from public.claim_home_trusted_logo($1, 'old-destination')", [
            id(2),
          ])
        ).rows,
      ).toHaveLength(0);
      const changed = await db.query<{
        logo_path: string | null;
        source_image_url: string | null;
        claim_token: string;
      }>("select * from public.claim_home_trusted_logo($1, 'new-destination')", [id(2)]);
      expect(changed.rows[0].logo_path).toBeNull();
      expect(changed.rows[0].source_image_url).toBeNull();
      const oldFinish = await db.query(
        "update public.home_trusted_logo_cache set logo_path = 'wrong.png' where submission_id = $1 and source_key = 'old-destination' and claim_token = $2 returning submission_id",
        [id(2), original.rows[0].claim_token],
      );
      expect(oldFinish.rows).toHaveLength(0);
    });
  });

  it("creates a constrained public image bucket and removes cache metadata with a submission", async () => {
    const bucket = await db.query<{
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>("select * from storage.buckets where id = 'home-trusted-logos'");
    expect(bucket.rows[0].public).toBe(true);
    expect(Number(bucket.rows[0].file_size_limit)).toBe(2 * 1024 * 1024);
    expect(bucket.rows[0].allowed_mime_types).not.toContain("text/html");
    await db.query("select * from public.claim_home_trusted_logo($1, 'test')", [id(3)]);
    await db.query("delete from public.submissions where id = $1", [id(3)]);
    expect(
      (
        await db.query("select * from public.home_trusted_logo_cache where submission_id = $1", [
          id(3),
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
