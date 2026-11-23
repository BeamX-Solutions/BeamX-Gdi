import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { creditLedger, payment, user } from "../schema";
import * as credits from "./credits";
import * as payments from "./payments";
import { deleteAccount } from "./users";

// Spec 0004, milestone 3: payments grant once (AC-13), history pages (AC-14), payment
// rows outlive the account (AC-19).

const accounts: string[] = [];
const paymentIds: string[] = [];
afterAll(async () => {
  await Promise.all(accounts.map((id) => deleteAccount(id)));
  for (const id of paymentIds)
    await db.delete(payment).where(eq(payment.id, id));
});

const account = async () => {
  const id = newId();
  await db.insert(user).values({
    id,
    name: "Ada",
    email: `pay-${id}@test.beamx`,
    emailVerified: true,
    isAnonymous: false,
  });
  accounts.push(id);
  await credits.ensureAccount(id, 30);
  return id;
};

const pack = { id: "p100", credits: 100, amountKobo: 1_000_000 } as const;

const pending = async (userId: string) => {
  const row = await payments.create(userId, pack);
  paymentIds.push(row.id);
  return row;
};

const paid = (
  over: Partial<Parameters<typeof payments.markSucceeded>[1]> = {},
) => ({
  transactionId: "4099260516",
  paidAt: "2026-11-23T10:15:00.000Z",
  amountKobo: 1_000_000,
  currency: "NGN",
  ...over,
});

const purchases = (paymentId: string) =>
  db.select().from(creditLedger).where(eq(creditLedger.paymentId, paymentId));

describe("payments", () => {
  it("creates a pending payment with the pack copied in", async () => {
    const u = await account();
    const row = await pending(u);
    expect(row).toMatchObject({
      userId: u,
      packId: "p100",
      credits: 100,
      amountKobo: 1_000_000,
      currency: "NGN",
      status: "pending",
    });
    expect(await payments.forUser(u, row.id)).toMatchObject({ id: row.id });
  });

  it("is owner scoped: another user's reference is null", async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const row = await pending(a);
    expect(await payments.forUser(b, row.id)).toBeNull();
  });

  it("grants once when the webhook and the callback race (AC-13)", async () => {
    const u = await account();
    const row = await pending(u);
    const results = await Promise.all([
      payments.markSucceeded(row.id, paid()),
      payments.markSucceeded(row.id, paid()),
      payments.markSucceeded(row.id, paid()),
    ]);
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    const entries = await purchases(row.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "purchase",
      amount: 100,
      balanceAfter: 130,
      idempotencyKey: `purchase:${row.id}`,
    });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 130 });
    expect(await payments.byId(row.id)).toMatchObject({
      status: "succeeded",
      paystackTransactionId: "4099260516",
    });
  });

  it("grants nothing when the amount or currency differs (AC-13)", async () => {
    const u = await account();
    const row = await pending(u);
    for (const p of [paid({ amountKobo: 100 }), paid({ currency: "USD" })])
      expect((await payments.markSucceeded(row.id, p)).granted).toBe(false);
    expect(await purchases(row.id)).toHaveLength(0);
    expect(await payments.byId(row.id)).toMatchObject({ status: "pending" });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 30 });
  });

  it("still grants a late success after failed or abandoned, and never leaves succeeded", async () => {
    const u = await account();
    const row = await pending(u);
    expect(await payments.markFailed(row.id)).toBe(true);
    expect((await payments.markSucceeded(row.id, paid())).granted).toBe(true);
    expect(await payments.markFailed(row.id)).toBe(false);
    expect(await payments.byId(row.id)).toMatchObject({ status: "succeeded" });
  });

  it("opens a missing account with the purchase", async () => {
    const id = newId();
    await db.insert(user).values({
      id,
      name: "Bo",
      email: `pay-${id}@test.beamx`,
      emailVerified: true,
      isAnonymous: false,
    });
    accounts.push(id);
    const row = await pending(id);
    expect((await payments.markSucceeded(row.id, paid())).granted).toBe(true);
    expect(await credits.getSummary(id)).toMatchObject({ balance: 100 });
  });

  it("lists stale pending payments and abandons them only after 24 hours", async () => {
    const u = await account();
    const [old, fresh] = await Promise.all([pending(u), pending(u)]);
    await db.execute(
      sql`UPDATE payment SET created_at = now() - interval '25 hours' WHERE id = ${old.id}::uuid`,
    );
    const stale = await payments.listStalePending(60, 1000);
    const ids = stale.map((p) => p.id);
    expect(ids).toContain(old.id);
    expect(ids).not.toContain(fresh.id);
    expect(await payments.markAbandoned(fresh.id, 24)).toBe(false);
    expect(await payments.markAbandoned(old.id, 24)).toBe(true);
    expect(await payments.byId(old.id)).toMatchObject({ status: "abandoned" });
  });

  it("keeps the payment with a null user after deletion, and its ledger goes (AC-19)", async () => {
    const u = await account();
    const row = await pending(u);
    await payments.markSucceeded(row.id, paid());
    await deleteAccount(u);
    expect(await payments.byId(row.id)).toMatchObject({
      userId: null,
      status: "succeeded",
    });
    expect(await purchases(row.id)).toHaveLength(0);
  });
});

describe("credit history (AC-14)", () => {
  it("pages newest first by keyset, owner scoped", async () => {
    const [u, other] = await Promise.all([account(), account()]);
    // 30 starter + 5 purchases = 6 entries.
    for (let i = 0; i < 5; i += 1) {
      const row = await pending(u);
      await payments.markSucceeded(row.id, paid());
    }
    const first = await credits.listLedger(u, null, 4);
    expect(first.entries).toHaveLength(4);
    expect(first.hasMore).toBe(true);
    expect(first.entries[0]).toMatchObject({
      kind: "purchase",
      balanceAfter: 530,
    });
    const last = first.entries.at(-1);
    if (!last) throw new Error("no entries");
    const second = await credits.listLedger(
      u,
      { createdAt: last.createdAt, id: last.id },
      4,
    );
    expect(second.entries).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(second.entries.at(-1)).toMatchObject({ kind: "starter_grant" });
    const seen = new Set(
      [...first.entries, ...second.entries].map((e) => e.id),
    );
    expect(seen.size).toBe(6);
    const theirs = await credits.listLedger(other, null, 20);
    expect(theirs.entries.every((e) => !seen.has(e.id))).toBe(true);
  });
});
