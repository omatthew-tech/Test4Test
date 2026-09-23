// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const owner = "83000000-0000-4000-8000-000000000001";
const stranger = "83000000-0000-4000-8000-000000000002";
const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table profiles(id uuid primary key, ban_status text default 'clear');
    create table credit_transactions(id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade,
      type text constraint credit_transactions_type_check check(type in ('adjustment')), amount integer not null, reason text not null);
    grant select, update on profiles to service_role; grant all on credit_transactions to service_role;
    insert into profiles(id) values('${owner}'),('${stranger}');`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260923013630_stripe_credit_purchases.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await begin(90, owner, "credits_1");
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260923163704_update_single_credit_price.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await db.close();
});

async function begin(n: number, user = owner, pack = "credits_3") {
  return db.query("select * from begin_credit_purchase($1,$2,$3,false)", [id(n), user, pack]);
}
async function apply(n: number, event: string, action = "paid", subtotal = 1399, live = false) {
  return db.query(
    "select apply_credit_purchase_event($1,'test',$2,$3,$4,$5,$6,$7,1500,'usd',null) as result",
    [event, id(n), live, action, `cs_${n}`, `pi_${n}`, subtotal],
  );
}
describe("Stripe credit ledger", () => {
  it("uses $4.99 for new single-credit orders and preserves existing $5 orders", async () => {
    expect((await begin(6, owner, "credits_1")).rows[0]).toMatchObject({
      credits: 1,
      amount_subtotal: 499,
    });
    expect((await begin(90, owner, "credits_1")).rows[0]).toMatchObject({
      credits: 1,
      amount_subtotal: 500,
    });
    await expect(apply(6, "evt_old_price", "paid", 500)).rejects.toThrow(/match/);
    await apply(6, "evt_single_credit", "paid", 499);
    await apply(90, "evt_legacy_single_credit", "paid", 500);
    expect(
      (await db.query("select amount from credit_transactions where purchase_order_id=$1", [id(6)]))
        .rows,
    ).toEqual([{ amount: 1 }]);
  });
  it("snapshots server prices and reuses only matching requests", async () => {
    const first = await begin(1);
    expect(first.rows[0]).toMatchObject({ credits: 3, amount_subtotal: 1399 });
    expect((await begin(1)).rows).toEqual(first.rows);
    await expect(begin(1, stranger)).rejects.toThrow(/conflicts/);
    await expect(begin(1, owner, "credits_5")).rejects.toThrow(/conflicts/);
  });
  it("awards once across duplicate and differently identified payment events", async () => {
    await apply(1, "evt_1");
    expect((await apply(1, "evt_1")).rows[0]).toEqual({ result: "duplicate" });
    await apply(1, "evt_2");
    await apply(1, "evt_late_failure", "failed");
    expect(
      (await db.query("select amount from credit_transactions where purchase_order_id=$1", [id(1)]))
        .rows,
    ).toEqual([{ amount: 3 }]);
    expect(
      (await db.query("select status from credit_purchase_orders where id=$1", [id(1)])).rows[0],
    ).toEqual({ status: "paid" });
  });
  it("rolls back event receipts when amounts or mode do not match", async () => {
    await begin(2);
    await expect(apply(2, "evt_bad", "paid", 1)).rejects.toThrow(/match/);
    await expect(apply(2, "evt_bad_mode", "paid", 1399, true)).rejects.toThrow(/mode/);
    expect(
      (await db.query("select * from stripe_credit_events where order_id=$1", [id(2)])).rows,
    ).toEqual([]);
    await apply(2, "evt_bad");
  });
  it("holds a refunded or disputed purchase for review even if payment arrives later", async () => {
    await begin(3);
    await apply(3, "evt_refund_first", "review");
    await apply(3, "evt_payment_later");
    expect(
      (
        await db.query(
          "select credits_granted,review_required from credit_purchase_orders where id=$1",
          [id(3)],
        )
      ).rows[0],
    ).toEqual({ credits_granted: false, review_required: true });
    expect(
      (await db.query("select * from credit_transactions where purchase_order_id=$1", [id(3)]))
        .rows,
    ).toEqual([]);
  });
  it("protects financial mutations and hides another user's orders with RLS", async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${stranger}';`);
    try {
      expect((await db.query("select * from credit_purchase_orders")).rows).toEqual([]);
      await expect(begin(4, stranger)).rejects.toThrow(/permission denied/);
      await expect(apply(1, "evt_forged")).rejects.toThrow(/permission denied/);
      await expect(
        db.exec("update credit_purchase_orders set credits_granted=true"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("lets the owner see status but never grants credits from invoice-only events", async () => {
    await begin(5);
    await apply(5, "evt_invoice", "invoice");
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
    try {
      expect(
        (
          await db.query("select status,credits_granted from credit_purchase_orders where id=$1", [
            id(5),
          ])
        ).rows[0],
      ).toEqual({ status: "pending", credits_granted: false });
    } finally {
      await db.exec("reset role");
    }
  });
});
