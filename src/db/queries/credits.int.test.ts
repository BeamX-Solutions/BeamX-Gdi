import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import * as conversations from "./conversations";
import * as credits from "./credits";
import { releaseRunHolds } from "./credit-holds";
import * as reports from "./reports";
import * as runs from "./runs";
import { linkGuest } from "./users";
import { completeFromAnswers, guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

/** A user with a credit account holding `grant` starter credits. */
const funded = async (grant: number) => {
  const u = await t.guest();
  await credits.ensureAccount(u, grant);
  return u;
};

const startPaid = async (u: string, price: number) => {
  const conv = await conversations.create(u);
  return credits.startRunWithHold(u, conv.id, "stellar", "1", price);
};

/** A completed, claimed run (attempt 1) holding `price`. */
const claimedRun = async (u: string, price: number) => {
  const { run } = unwrap(await startPaid(u, price));
  unwrap(await runs.saveAnswer(u, run.id, "q1", "a", "client"));
  unwrap(await completeFromAnswers(u, run.id));
  unwrap(await reports.claim(u, run.id));
  return run;
};

/** AC-20: ledger sum equals balance, and held equals the active hold total. */
const expectBooksBalance = async (u: string) => {
  const r = await db.execute(sql`
    SELECT a.balance, a.held,
      (SELECT coalesce(sum(amount), 0)::int FROM credit_ledger WHERE user_id = a.user_id) AS ledger,
      (SELECT coalesce(sum(amount), 0)::int FROM credit_hold WHERE user_id = a.user_id AND status = 'active') AS holds
    FROM credit_account a WHERE a.user_id = ${u}::uuid
  `);
  const row = r.rows[0] as
    | { balance: number; held: number; ledger: number; holds: number }
    | undefined;
  expect(row).toBeDefined();
  expect(Number(row?.ledger)).toBe(Number(row?.balance));
  expect(Number(row?.holds)).toBe(Number(row?.held));
};

const ledgerKinds = async (u: string) => {
  const r = await db.execute(sql`
    SELECT kind, amount FROM credit_ledger WHERE user_id = ${u}::uuid ORDER BY created_at, id
  `);
  return r.rows.map((x) => {
    const row = x as { kind: string; amount: number };
    return [row.kind, Number(row.amount)] as const;
  });
};

describe("account and starter grant (AC-11)", () => {
  it("creates the account with its grant once, idempotently", async () => {
    const u = await t.guest();
    expect(await credits.ensureAccount(u, 30)).toEqual({
      created: true,
      granted: 30,
    });
    expect(await credits.ensureAccount(u, 30)).toEqual({
      created: false,
      granted: 0,
    });
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30,
      held: 0,
      available: 30,
    });
    expect(await ledgerKinds(u)).toEqual([["starter_grant", 30]]);
    await expectBooksBalance(u);
  });

  it("a capped guest gets an account with 0 credits and no ledger entry", async () => {
    const u = await t.guest();
    expect(await credits.ensureAccount(u, 0)).toEqual({
      created: true,
      granted: 0,
    });
    expect(await ledgerKinds(u)).toEqual([]);
    expect(await startPaid(u, 30)).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 0 },
    });
  });
});

describe("holding at run start (AC-1, AC-3)", () => {
  it("starts the run and holds the price together", async () => {
    const u = await funded(30);
    const { run, hold } = unwrap(await startPaid(u, 30));
    expect(hold).toMatchObject({ runId: run.id, amount: 30, status: "active" });
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30,
      held: 30,
      available: 0,
    });
    await expectBooksBalance(u);
  });

  it("short balance starts nothing: no run, no hold", async () => {
    const u = await funded(20);
    const conv = await conversations.create(u);
    expect(
      await credits.startRunWithHold(u, conv.id, "stellar", "1", 30),
    ).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 20 },
    });
    const live = await runs.getActive(u, conv.id);
    expect(live.active).toBeNull();
    expect(await credits.getSummary(u)).toMatchObject({ held: 0 });
  });

  it("two racing approvals for the same credits: exactly one wins", async () => {
    const u = await funded(40);
    const [a, b] = await Promise.all([startPaid(u, 30), startPaid(u, 30)]);
    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect(losses[0]).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 10 },
    });
    expect(await credits.getSummary(u)).toMatchObject({ held: 30 });
    await expectBooksBalance(u);
  });

  it("another user's conversation is not_found and holds nothing", async () => {
    const owner = await funded(30);
    const other = await funded(30);
    const conv = await conversations.create(owner);
    expect(
      await credits.startRunWithHold(other, conv.id, "stellar", "1", 30),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await credits.getSummary(other)).toMatchObject({ held: 0 });
  });
});

describe("charging when the report is ready (AC-4)", () => {
  it("charges the hold exactly once, in the same statement as ready", async () => {
    const u = await funded(30);
    const run = await claimedRun(u, 30);
    expect(
      unwrap(await reports.markReady(run.id, 1, { ok: true }, "m")).status,
    ).toBe("ready");
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 0,
      held: 0,
    });
    expect(await ledgerKinds(u)).toEqual([
      ["starter_grant", 30],
      ["run_charge", -30],
    ]);
    // A replay changes nothing.
    expect(await reports.markReady(run.id, 1, { ok: true }, "m")).toEqual({
      ok: false,
      error: { code: "stale_attempt" },
    });
    expect(await ledgerKinds(u)).toHaveLength(2);
    await expectBooksBalance(u);
  });

  it("a stale attempt charges nothing", async () => {
    const u = await funded(30);
    const run = await claimedRun(u, 30);
    // Attempt 1 failed, attempt 2 is the live claim; attempt 1 reporting late is stale.
    unwrap(
      await reports.markFailed(run.id, 1, { kind: "timeout", message: "t" }),
    );
    unwrap(await reports.claim(u, run.id));
    expect(await reports.markReady(run.id, 1, { ok: true }, "m")).toEqual({
      ok: false,
      error: { code: "stale_attempt" },
    });
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30,
      held: 30,
    });
  });

  it("no active hold: the report is never ready for free, the attempt fails", async () => {
    const u = await funded(30);
    const run = await claimedRun(u, 30);
    // Simulate the idle sweep releasing the hold mid flight.
    await releaseRunHolds(sql`SELECT ${run.id}::uuid`, "idle");
    expect(await reports.markReady(run.id, 1, { ok: true }, "m")).toEqual({
      ok: false,
      error: { code: "no_credit_hold" },
    });
    const { report } = unwrap(await runs.get(u, run.id));
    expect(report?.status).toBe("failed");
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30,
      held: 0,
    });
    // And no new claim starts until credits are held again (AC-7).
    expect(await reports.claim(u, run.id)).toEqual({
      ok: false,
      error: { code: "no_credit_hold" },
    });
    unwrap(await credits.holdExistingRun(u, run.id, 30));
    expect(unwrap(await reports.claim(u, run.id)).attempts).toBe(2);
  });
});

describe("failure releases the hold (AC-5)", () => {
  it("keeps the hold while retries remain, releases after the third failure", async () => {
    const u = await funded(30);
    const run = await claimedRun(u, 30);
    const fail = { kind: "timeout", message: "t" } as const;

    unwrap(await reports.markFailed(run.id, 1, fail));
    expect(await credits.getSummary(u)).toMatchObject({ held: 30 });
    unwrap(await reports.claim(u, run.id));
    unwrap(await reports.markFailed(run.id, 2, fail));
    expect(await credits.getSummary(u)).toMatchObject({ held: 30 });
    unwrap(await reports.claim(u, run.id));
    unwrap(await reports.markFailed(run.id, 3, fail));

    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30,
      held: 0,
    });
    expect(await ledgerKinds(u)).toEqual([["starter_grant", 30]]);
    await expectBooksBalance(u);
  });

  it("abandoning a run releases its hold", async () => {
    const u = await funded(30);
    const { run } = unwrap(await startPaid(u, 30));
    unwrap(await runs.abandon(u, run.id));
    expect(await credits.getSummary(u)).toMatchObject({ held: 0 });
    expect(await credits.activeRunHold(u, run.id)).toBeNull();
  });

  it("deleting the conversation releases its runs' holds", async () => {
    const u = await funded(60);
    const conv = await conversations.create(u);
    unwrap(await credits.startRunWithHold(u, conv.id, "stellar", "1", 30));
    unwrap(await credits.startRunWithHold(u, conv.id, "beacon", "1", 30));
    expect(await credits.getSummary(u)).toMatchObject({ held: 60 });
    unwrap(await conversations.remove(u, conv.id));
    expect(await credits.getSummary(u)).toMatchObject({
      balance: 60,
      held: 0,
    });
    await expectBooksBalance(u);
  });
});

describe("resuming after the hold was released (AC-7)", () => {
  it("resumes and holds today's price together", async () => {
    const u = await funded(50);
    const conv = await conversations.create(u);
    const { run } = unwrap(
      await credits.startRunWithHold(u, conv.id, "luna", "1", 30),
    );
    unwrap(await runs.pause(u, run.id));
    await releaseRunHolds(sql`SELECT ${run.id}::uuid`, "idle");

    const resumed = unwrap(await credits.resumeRunWithHold(u, run.id, 40));
    expect(resumed.run.status).toBe("in_progress");
    expect(resumed.hold.amount).toBe(40);
    expect(await credits.getSummary(u)).toMatchObject({ held: 40 });
  });

  it("short balance resumes nothing", async () => {
    const u = await funded(30);
    const conv = await conversations.create(u);
    const { run } = unwrap(
      await credits.startRunWithHold(u, conv.id, "luna", "1", 30),
    );
    unwrap(await runs.pause(u, run.id));
    await releaseRunHolds(sql`SELECT ${run.id}::uuid`, "idle");

    expect(await credits.resumeRunWithHold(u, run.id, 40)).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 30 },
    });
    expect(unwrap(await runs.get(u, run.id)).run.status).toBe("paused");
  });

  it("a run that still holds credits cannot be held twice", async () => {
    const u = await funded(60);
    const { run } = unwrap(await startPaid(u, 30));
    expect(await credits.holdExistingRun(u, run.id, 30)).toEqual({
      ok: false,
      error: { code: "already_held" },
    });
    expect(await credits.getSummary(u)).toMatchObject({ held: 30 });
  });
});

describe("guest link (AC-12)", () => {
  it("a brand new account receives the guest's balance, holds and ledger", async () => {
    const guest = await funded(30);
    const account = await t.guest();
    const { run } = unwrap(await startPaid(guest, 20));

    await linkGuest(guest, account);

    expect(await credits.getSummary(guest)).toBeNull();
    expect(await credits.getSummary(account)).toMatchObject({
      balance: 30,
      held: 20,
    });
    expect(await credits.activeRunHold(account, run.id)).toMatchObject({
      amount: 20,
    });
    await expectBooksBalance(account);
  });

  it("an existing account keeps held credits for the run, drops unspent free ones", async () => {
    const guest = await funded(30);
    const account = await funded(50);
    const { run } = unwrap(await startPaid(guest, 20));

    await linkGuest(guest, account);

    // 50 (account) + 20 held for the guest's run; the guest's spare 10 is forfeited.
    expect(await credits.getSummary(account)).toMatchObject({
      balance: 70,
      held: 20,
    });
    expect(await ledgerKinds(account)).toContainEqual([
      "guest_grant_forfeit",
      -10,
    ]);
    await expectBooksBalance(account);

    // The moved run can still be paid for and charged.
    unwrap(await runs.saveAnswer(account, run.id, "q1", "a", "client"));
    unwrap(await completeFromAnswers(account, run.id));
    unwrap(await reports.claim(account, run.id));
    unwrap(await reports.markReady(run.id, 1, { ok: true }, "m"));
    expect(await credits.getSummary(account)).toMatchObject({
      balance: 50,
      held: 0,
    });
    await expectBooksBalance(account);
  });
});
