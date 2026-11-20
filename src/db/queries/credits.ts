import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { billingAssertCode, isUniqueViolation } from "../errors";
import { newId } from "../id";
import { creditAccount, creditHold, toolRun } from "../schema";
import {
  resumeStatements,
  selectRun,
  startStatements,
  withActiveRetry,
} from "./runs";
import { err, ok, type Result } from "@/lib/result";

/**
 * Credits (spec 0004). Every balance change goes through the statement shapes here:
 * hold `held += p WHERE balance - held >= p`; charge `balance -= c, held -= amount`;
 * release `held -= amount`; grants `balance += a` fed by a ledger insert. Each shape is
 * one statement (chained CTEs) so a check and its write can never be split by a race.
 */

type RunRow = typeof toolRun.$inferSelect;
type HoldRow = typeof creditHold.$inferSelect;

const ACTIVE_HOLD_INDEX = "credit_hold_one_active_per_run";

export type Summary = {
  readonly balance: number;
  readonly held: number;
  readonly available: number;
  readonly lastActivityAt: string;
};

export type HoldError =
  | { readonly code: "not_found" }
  | { readonly code: "run_in_progress" }
  | { readonly code: "not_paused" }
  | { readonly code: "already_held" }
  | { readonly code: "insufficient_credits"; readonly available: number };

/** The account summary, or null when the user has no credit account yet. */
export const getSummary = async (userId: string): Promise<Summary | null> => {
  const rows = await db
    .select()
    .from(creditAccount)
    .where(eq(creditAccount.userId, userId));
  const a = rows[0];
  return a
    ? {
        balance: a.balance,
        held: a.held,
        available: a.balance - a.held,
        lastActivityAt: a.lastActivityAt,
      }
    : null;
};

/**
 * Creates the credit account with its starter grant, once per user (AC-11). The caller
 * decides `starterGrant` (0 when the guest IP cap is reached) and bumps the IP counter
 * only when `granted > 0`. Idempotent: an existing account is left untouched.
 */
export const ensureAccount = async (
  userId: string,
  starterGrant: number,
): Promise<{ readonly created: boolean; readonly granted: number }> => {
  const result = await db.execute(sql`
    WITH acc AS (
      INSERT INTO credit_account (user_id, balance)
      SELECT u.id, ${starterGrant}::int FROM "user" u WHERE u.id = ${userId}::uuid
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id, balance
    ), led AS (
      INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
      SELECT ${newId()}::uuid, user_id, 'starter_grant', balance, balance, 'starter:' || user_id
      FROM acc WHERE balance > 0
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT balance FROM acc
  `);
  const row = result.rows[0] as { balance: number } | undefined;
  return row
    ? { created: true, granted: Number(row.balance) }
    : { created: false, granted: 0 };
};

/** The run's active hold, or null. Used to decide whether resuming needs approval. */
export const activeRunHold = async (
  userId: string,
  runId: string,
): Promise<HoldRow | null> => {
  const rows = await db
    .select()
    .from(creditHold)
    .where(
      and(
        eq(creditHold.runId, runId),
        eq(creditHold.userId, userId),
        eq(creditHold.status, "active"),
        eq(creditHold.purpose, "run"),
      ),
    );
  return rows[0] ?? null;
};

/** Hold shape: raise `held` only if the run is the user's, live, and affordable. */
const holdForRunStatement = (
  userId: string,
  runId: string,
  holdId: string,
  price: number,
) =>
  db.execute(sql`
    WITH a AS (
      UPDATE credit_account
      SET held = held + ${price}::int, last_activity_at = now(), updated_at = now()
      WHERE user_id = ${userId}::uuid AND balance - held >= ${price}::int
        AND EXISTS (
          SELECT 1 FROM tool_run
          WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status <> 'abandoned'
        )
      RETURNING user_id
    )
    INSERT INTO credit_hold (id, user_id, purpose, run_id, amount)
    SELECT ${holdId}::uuid, user_id, 'run', ${runId}::uuid, ${price}::int FROM a
  `);

const assertStatement = (condition: SQL, code: string) =>
  db.execute(sql`SELECT billing_assert(${condition}, ${code})`);

const assertRunExists = (userId: string, runId: string) =>
  assertStatement(
    sql`EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid)`,
    "not_found",
  );

const assertHoldPlaced = (holdId: string) =>
  assertStatement(
    sql`EXISTS (SELECT 1 FROM credit_hold WHERE id = ${holdId}::uuid)`,
    "insufficient_credits",
  );

const selectHold = (holdId: string) =>
  db.select().from(creditHold).where(eq(creditHold.id, holdId));

/**
 * Turns a failed billing batch into a typed error. Anything else is an infrastructure
 * failure and is thrown on.
 */
const mapHoldFailure = async (
  e: unknown,
  userId: string,
): Promise<HoldError> => {
  if (isUniqueViolation(e, ACTIVE_HOLD_INDEX)) return { code: "already_held" };
  const code = billingAssertCode(e);
  switch (code) {
    case "not_found":
      return { code: "not_found" };
    case "not_paused":
      return { code: "not_paused" };
    case "insufficient_credits": {
      const summary = await getSummary(userId);
      return {
        code: "insufficient_credits",
        available: summary?.available ?? 0,
      };
    }
    case null:
    default:
      throw e;
  }
};

/**
 * Starts a paid run and holds its price, all or nothing (AC-1, AC-3). `price` is the
 * server side price, never one from the client (AC-2). Call `ensureAccount` first.
 */
export const startRunWithHold = async (
  userId: string,
  conversationId: string,
  toolId: string,
  toolVersion: string,
  price: number,
): Promise<
  Result<{ run: RunRow; hold: HoldRow; pausedRunId: string | null }, HoldError>
> => {
  const runId = newId();
  const holdId = newId();
  try {
    const outcome = await withActiveRetry(async () => {
      const [paused, , , , , created, hold] = await db.batch([
        ...startStatements(userId, conversationId, runId, toolId, toolVersion),
        holdForRunStatement(userId, runId, holdId, price),
        assertRunExists(userId, runId),
        assertHoldPlaced(holdId),
        selectRun(userId, runId),
        selectHold(holdId),
      ]);
      return {
        run: created[0],
        hold: hold[0],
        pausedRunId: paused[0]?.id ?? null,
      };
    });
    if (outcome.conflict) return err({ code: "run_in_progress" });
    const { run, hold, pausedRunId } = outcome.value;
    if (!run || !hold) return err({ code: "not_found" });
    return ok({ run, hold, pausedRunId });
  } catch (e) {
    return err(await mapHoldFailure(e, userId));
  }
};

/**
 * Resumes a paused run whose hold was released (idle, AC-7) and holds today's price, all
 * or nothing. A run that still has an active hold resumes with plain `runs.resume`.
 */
export const resumeRunWithHold = async (
  userId: string,
  runId: string,
  price: number,
): Promise<
  Result<{ run: RunRow; hold: HoldRow; pausedRunId: string | null }, HoldError>
> => {
  const holdId = newId();
  try {
    const outcome = await withActiveRetry(async () => {
      const [paused, , , , , , current, hold] = await db.batch([
        ...resumeStatements(userId, runId),
        holdForRunStatement(userId, runId, holdId, price),
        assertRunExists(userId, runId),
        assertStatement(
          sql`EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'in_progress')`,
          "not_paused",
        ),
        assertHoldPlaced(holdId),
        selectRun(userId, runId),
        selectHold(holdId),
      ]);
      const first = paused.rows[0] as { id: string } | undefined;
      return { run: current[0], hold: hold[0], pausedRunId: first?.id ?? null };
    });
    if (outcome.conflict) return err({ code: "run_in_progress" });
    const { run, hold, pausedRunId } = outcome.value;
    if (!run || !hold) return err({ code: "not_found" });
    return ok({ run, hold, pausedRunId });
  } catch (e) {
    return err(await mapHoldFailure(e, userId));
  }
};

/**
 * Holds today's price for an existing run with no active hold, without changing the run
 * (a completed run whose report must be retried after its hold was released).
 */
export const holdExistingRun = async (
  userId: string,
  runId: string,
  price: number,
): Promise<Result<HoldRow, HoldError>> => {
  const holdId = newId();
  try {
    const [, , , hold] = await db.batch([
      holdForRunStatement(userId, runId, holdId, price),
      assertRunExists(userId, runId),
      assertHoldPlaced(holdId),
      selectHold(holdId),
    ]);
    const row = hold[0];
    return row ? ok(row) : err({ code: "not_found" });
  } catch (e) {
    return err(await mapHoldFailure(e, userId));
  }
};

/**
 * Guest link statements for `users.linkGuest` (spec 0004, AC-12), in batch order. The
 * move or merge choice happens inside SQL, never by reading first in app code:
 * - the guest account row is locked first;
 * - only when the target already has an account, the guest's unspent free credits
 *   (`balance - held`) are dropped with a `guest_grant_forfeit` entry, so the merge
 *   cannot be used to farm starter grants;
 * - ledger and holds move to the target;
 * - the target is upserted (`ON CONFLICT DO UPDATE` adds the guest's remaining balance
 *   and held amount, so credits held for an unfinished run still back it);
 * - the guest account row is deleted.
 * The sum of the target's ledger still equals its balance afterwards.
 */
export const linkGuestCreditStatements = (
  guestUserId: string,
  newUserId: string,
) => {
  const targetHasAccount = sql`EXISTS (SELECT 1 FROM credit_account t WHERE t.user_id = ${newUserId}::uuid)`;
  return [
    db.execute(sql`
      SELECT 1 FROM credit_account WHERE user_id = ${guestUserId}::uuid FOR UPDATE
    `),
    db.execute(sql`
      INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
      SELECT ${newId()}::uuid, g.user_id, 'guest_grant_forfeit', -(g.balance - g.held), g.held,
             'forfeit:' || g.user_id
      FROM credit_account g
      WHERE g.user_id = ${guestUserId}::uuid AND g.balance > g.held AND ${targetHasAccount}
      ON CONFLICT (idempotency_key) DO NOTHING
    `),
    db.execute(sql`
      UPDATE credit_account g SET balance = g.held, updated_at = now()
      WHERE g.user_id = ${guestUserId}::uuid AND g.balance > g.held AND ${targetHasAccount}
    `),
    db.execute(sql`
      UPDATE credit_ledger SET user_id = ${newUserId}::uuid
      WHERE user_id = ${guestUserId}::uuid RETURNING id
    `),
    db.execute(sql`
      UPDATE credit_hold SET user_id = ${newUserId}::uuid
      WHERE user_id = ${guestUserId}::uuid RETURNING id
    `),
    db.execute(sql`
      INSERT INTO credit_account (user_id, balance, held, last_activity_at, created_at, updated_at)
      SELECT ${newUserId}::uuid, g.balance, g.held, g.last_activity_at, g.created_at, now()
      FROM credit_account g WHERE g.user_id = ${guestUserId}::uuid
      ON CONFLICT (user_id) DO UPDATE
      SET balance = credit_account.balance + excluded.balance,
          held = credit_account.held + excluded.held,
          last_activity_at = greatest(credit_account.last_activity_at, excluded.last_activity_at),
          updated_at = now()
    `),
    db.execute(sql`
      DELETE FROM credit_account WHERE user_id = ${guestUserId}::uuid RETURNING user_id
    `),
  ] as const;
};
