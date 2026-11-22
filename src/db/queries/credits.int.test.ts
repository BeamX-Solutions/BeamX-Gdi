import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
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

describe("runQuote (spec 0006)", () => {
  it("reads the run with its active hold, owner scoped", async () => {
    const u = await funded(100);
    const other = await t.guest();
    const { run } = unwrap(await startPaid(u, 30));
    expect(unwrap(await credits.runQuote(u, run.id))).toEqual({
      toolId: "stellar",
      toolVersion: "1",
      status: "in_progress",
      conversationId: run.conversationId,
      heldAmount: 30,
    });
    expect(await credits.runQuote(other, run.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });

    // Abandoning releases the hold: the quote shows no hold any more.
    unwrap(await runs.abandon(u, run.id));
    expect(unwrap(await credits.runQuote(u, run.id))).toMatchObject({
      status: "abandoned",
      heldAmount: null,
    });
  });
});

describe("startFromWithHold (spec 0006)", () => {
  it("copies a completed run and holds the price in one batch", async () => {
    const u = await funded(100);
    const run = await claimedRun(u, 30);
    const next = unwrap(await credits.startFromWithHold(u, run.id, "1", 30));
    expect(next.run.basedOnRunId).toBe(run.id);
    expect(next.run.status).toBe("in_progress");
    expect(next.hold).toMatchObject({ runId: next.run.id, amount: 30 });
    const copied = unwrap(await runs.get(u, next.run.id)).answers;
    expect(copied.map((a) => [a.questionId, a.value, a.source])).toEqual([
      ["q1", "a", "client"],
    ]);
    expect(await credits.getSummary(u)).toMatchObject({ held: 60 });
    await expectBooksBalance(u);
  });

  it("creates nothing when the balance is short", async () => {
    const u = await funded(40);
    const run = await claimedRun(u, 30);
    expect(await credits.startFromWithHold(u, run.id, "1", 30)).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 10 },
    });
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM tool_run WHERE based_on_run_id = ${run.id}::uuid
    `);
    expect(Number((r.rows[0] as { n: number }).n)).toBe(0);
    await expectBooksBalance(u);
  });

  it("refuses bad starts with typed errors and holds nothing", async () => {
    const u = await funded(100);
    const other = await funded(100);
    const { run } = unwrap(await startPaid(u, 30));
    expect(await credits.startFromWithHold(u, run.id, "1", 30)).toEqual({
      ok: false,
      error: { code: "previous_not_completed" },
    });
    unwrap(await runs.saveAnswer(u, run.id, "q1", "a", "client"));
    unwrap(await completeFromAnswers(u, run.id));
    expect(await credits.startFromWithHold(u, run.id, "2", 30)).toEqual({
      ok: false,
      error: { code: "version_changed" },
    });
    expect(await credits.startFromWithHold(other, run.id, "1", 30)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await credits.getSummary(u)).toMatchObject({ held: 30 });
    await expectBooksBalance(u);
  });
});

// Spec 0004, milestone 2: paid chat holds, the daily sweep, and one charge across phases.

const MESSAGE = () => newId();

const holdRow = async (holdId: string) => {
  const r = await db.execute(sql`
    SELECT status, release_reason, charged_amount FROM credit_hold WHERE id = ${holdId}::uuid
  `);
  return r.rows[0] as
    | {
        status: string;
        release_reason: string | null;
        charged_amount: number | null;
      }
    | undefined;
};

describe("chat holds (AC-10)", () => {
  it("holds the ceiling, then charges the real amount and releases the rest", async () => {
    const u = await funded(30);
    const { holdId } = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    expect((await credits.getSummary(u))?.held).toBe(3);

    const after = await credits.settleChat(holdId, 1);
    expect(after).toMatchObject({ balance: 29, held: 0, available: 29 });
    expect(await holdRow(holdId)).toMatchObject({
      status: "charged",
      charged_amount: 1,
    });
    expect(await ledgerKinds(u)).toEqual([
      ["starter_grant", 30],
      ["chat_charge", -1],
    ]);
    await expectBooksBalance(u);
  });

  it("settles only once: a second settle changes nothing", async () => {
    const u = await funded(30);
    const { holdId } = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    await credits.settleChat(holdId, 2);
    expect(await credits.settleChat(holdId, 2)).toBeNull();
    expect(await credits.settleChat(holdId, 0)).toBeNull();
    expect((await credits.getSummary(u))?.balance).toBe(28);
    await expectBooksBalance(u);
  });

  it("never charges more than was held", async () => {
    const u = await funded(30);
    const { holdId } = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    await credits.settleChat(holdId, 9);
    expect((await credits.getSummary(u))?.balance).toBe(27);
    await expectBooksBalance(u);
  });

  it("charging 0 releases the hold as chat_error with no ledger entry", async () => {
    const u = await funded(30);
    const { holdId } = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    expect(await credits.settleChat(holdId, 0)).toMatchObject({
      balance: 30,
      held: 0,
    });
    expect(await holdRow(holdId)).toMatchObject({
      status: "released",
      release_reason: "chat_error",
    });
    expect(await ledgerKinds(u)).toEqual([["starter_grant", 30]]);
  });

  it("refuses a hold the available balance does not cover, with the available amount", async () => {
    const u = await funded(2);
    expect(await credits.holdForChat(u, MESSAGE(), 3)).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 2 },
    });
    expect((await credits.getSummary(u))?.held).toBe(0);
  });

  it("is insufficient_credits with 0 available when there is no account", async () => {
    const u = await t.guest();
    expect(await credits.holdForChat(u, MESSAGE(), 3)).toEqual({
      ok: false,
      error: { code: "insufficient_credits", available: 0 },
    });
  });

  it("two racing chat holds on 4 credits: exactly one wins", async () => {
    const u = await funded(4);
    const results = await Promise.all([
      credits.holdForChat(u, MESSAGE(), 3),
      credits.holdForChat(u, MESSAGE(), 3),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await expectBooksBalance(u);
  });
});

describe("the daily hold sweep (AC-7, AC-10)", () => {
  it("releases a run hold idle 31 days, then resuming needs a new hold", async () => {
    const u = await funded(100);
    const { run } = unwrap(await startPaid(u, 30));
    await db.execute(sql`
      UPDATE tool_run SET updated_at = now() - interval '31 days' WHERE id = ${run.id}::uuid
    `);
    const swept = await credits.releaseIdleHolds(30, 15);
    expect(swept.idle).toBeGreaterThanOrEqual(1);
    expect(await credits.activeRunHold(u, run.id)).toBeNull();
    expect((await credits.getSummary(u))?.held).toBe(0);
    await expectBooksBalance(u);
  });

  it("keeps a run hold with recent activity", async () => {
    const u = await funded(100);
    const { run } = unwrap(await startPaid(u, 30));
    await credits.releaseIdleHolds(30, 15);
    expect(await credits.activeRunHold(u, run.id)).not.toBeNull();
  });

  it("skips an idle run whose report is generating", async () => {
    const u = await funded(100);
    const run = await claimedRun(u, 30);
    await db.execute(sql`
      UPDATE tool_run SET updated_at = now() - interval '31 days' WHERE id = ${run.id}::uuid
    `);
    await credits.releaseIdleHolds(30, 15);
    expect(await credits.activeRunHold(u, run.id)).not.toBeNull();
  });

  it("releases a chat hold still active after 15 minutes as chat_error", async () => {
    const u = await funded(30);
    const { holdId } = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    const fresh = unwrap(await credits.holdForChat(u, MESSAGE(), 3));
    await db.execute(sql`
      UPDATE credit_hold SET created_at = now() - interval '16 minutes' WHERE id = ${holdId}::uuid
    `);
    await credits.releaseIdleHolds(30, 15);
    expect(await holdRow(holdId)).toMatchObject({
      status: "released",
      release_reason: "chat_error",
    });
    expect((await holdRow(fresh.holdId))?.status).toBe("active");
    expect((await credits.getSummary(u))?.held).toBe(3);
    await expectBooksBalance(u);
  });
});

describe("a phased report is charged once (AC-6)", () => {
  it("fails partway, resumes from the failed phase, and charges once when ready", async () => {
    const u = await funded(100);
    const run = await claimedRun(u, 50);
    // Attempt 1 saves two phases, then fails on the third: the hold stays.
    unwrap(await reports.savePhase(run.id, 1, "one", { a: 1 }));
    unwrap(await reports.savePhase(run.id, 1, "two", { b: 2 }));
    unwrap(
      await reports.markFailed(run.id, 1, { kind: "timeout", message: "slow" }),
    );
    expect((await credits.getSummary(u))?.held).toBe(50);
    expect(await ledgerKinds(u)).toEqual([["starter_grant", 100]]);

    // Attempt 2 resumes with the saved phases and finishes the plan.
    unwrap(await reports.claim(u, run.id));
    unwrap(await reports.savePhase(run.id, 2, "three", { c: 3 }));
    unwrap(
      await reports.markReady(run.id, 2, { one: 1, two: 2, three: 3 }, "m"),
    );
    // A replay of the ready call charges nothing more.
    expect((await reports.markReady(run.id, 2, { x: 1 }, "m")).ok).toBe(false);

    expect(await ledgerKinds(u)).toEqual([
      ["starter_grant", 100],
      ["run_charge", -50],
    ]);
    expect(await credits.getSummary(u)).toMatchObject({ balance: 50, held: 0 });
    await expectBooksBalance(u);
  });
});
