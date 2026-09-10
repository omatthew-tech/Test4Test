// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("homepage submitted-test aggregate migration", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role unrelated;
      create table public.profiles (id integer primary key, ban_status text not null);
      create table public.submissions (
        id integer primary key, user_id integer, status text not null,
        reward_type text default 'credit', is_open_for_more_tests boolean default true
      );
      alter table public.profiles enable row level security;
      alter table public.submissions enable row level security;
      insert into public.profiles values (1, 'clear'), (2, 'banned');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20260910162749_home_submitted_test_count.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }, 30_000);
  afterAll(async () => db?.close());
  beforeEach(async () => {
    await db.exec(`
      delete from public.submissions;
      insert into public.submissions (id, user_id, status)
        select n, 1, 'live' from generate_series(1, 8) n;
      update public.submissions set reward_type = 'paid', is_open_for_more_tests = false where id = 8;
      insert into public.submissions (id, user_id, status) values
        (9, 1, 'draft'), (10, 1, 'paused'), (11, 1, 'pending_verification'),
        (12, 1, 'flagged'), (13, 2, 'live'), (14, null, 'live'), (15, 999, 'live');
    `);
  });

  async function count() {
    const result = await db.query<{ total: number }>(
      "select public.get_home_submitted_test_count() as total",
    );
    return Number(result.rows[0].total);
  }

  it("counts all published tests, including paid/closed tests, independently of the six cards or owner count", async () => {
    expect(await count()).toBe(8);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        expect(await count()).toBe(8);
        await expect(db.query("select * from public.submissions")).rejects.toMatchObject({
          code: "42501",
        });
        await expect(db.query("select * from public.profiles")).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await db.exec("reset role");
      }
    }
  });

  it("reflects publication, removal, pausing, and the empty state immediately", async () => {
    await db.exec("update public.submissions set status = 'live' where id = 9");
    expect(await count()).toBe(9);
    await db.exec("delete from public.submissions where id = 1");
    expect(await count()).toBe(8);
    await db.exec("update public.submissions set status = 'paused' where id = 2");
    expect(await count()).toBe(7);
    await db.exec("delete from public.submissions");
    expect(await count()).toBe(0);
  });

  it("does not grant arbitrary roles access to the privileged aggregate", async () => {
    await db.exec("set role unrelated");
    try {
      await expect(count()).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  });
});
