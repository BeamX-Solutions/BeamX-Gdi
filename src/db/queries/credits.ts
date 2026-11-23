import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { billingAssertCode, isUniqueViolation } from "../errors";
import { newId } from "../id";
import {
  creditAccount,
  creditHold,
  creditLedger,
  toolRun,
  user,
} from "../schema";
import { releaseRunHoldCtes } from "./credit-holds";
import {
  resumeStatements,
  selectRun,
  startFromSource,
  startFromStatements,
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
  const result = await ensureAccountStatement(userId, starterGrant);
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

/** What the assistant's money tools read before showing a card (spec 0006). */
export type RunQuote = {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly status: RunRow["status"];
  readonly conversationId: string | null;
  /** The run's active hold amount, or null when it has none. */
  readonly heldAmount: number | null;
};

/**
 * One owner scoped read of a run and its active run hold (spec 0006, `credits.runQuote`).
 * It feeds the server written `shownPrice` and `heldAmount` of the assistant's tools.
 */
export const runQuote = async (
  userId: string,
  runId: string,
): Promise<Result<RunQuote, { readonly code: "not_found" }>> => {
  const rows = await db
    .select({
      toolId: toolRun.toolId,
      toolVersion: toolRun.toolVersion,
      status: toolRun.status,
      conversationId: toolRun.conversationId,
      heldAmount: creditHold.amount,
    })
    .from(toolRun)
    .leftJoin(
      creditHold,
      and(
        eq(creditHold.runId, toolRun.id),
        eq(creditHold.userId, userId),
        eq(creditHold.status, "active"),
        eq(creditHold.purpose, "run"),
      ),
    )
    .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId)));
  const row = rows[0];
  return row ? ok(row) : err({ code: "not_found" });
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

export type StartFromHoldError =
  | HoldError
  | { readonly code: "previous_not_completed" }
  | { readonly code: "no_conversation" }
  | { readonly code: "version_changed" };

/**
 * "Change my answers" with money (spec 0006, `credits.startFromWithHold`): a new run
 * prefilled from a completed run, plus a hold of today's price, all or nothing. It
 * composes `runs.startFrom` and the hold the way `startRunWithHold` does. Call
 * `ensureAccount` first.
 */
export const startFromWithHold = async (
  userId: string,
  previousRunId: string,
  toolVersion: string,
  price: number,
): Promise<
  Result<
    { run: RunRow; hold: HoldRow; pausedRunId: string | null },
    StartFromHoldError
  >
> => {
  const source = await startFromSource(userId, previousRunId, toolVersion);
  if (!source.ok) return err(source.error);
  const runId = newId();
  const holdId = newId();
  try {
    const outcome = await withActiveRetry(async () => {
      const [paused, , , , , , created, hold] = await db.batch([
        ...startFromStatements(userId, previousRunId, runId, source.value),
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
 * Holds the chat ceiling for one paid chat reply (spec 0004, AC-10), keyed by the
 * assistant message id. One statement: the account's `held` goes up only when
 * `balance - held` covers `amount`, and the hold row is written from that update, so the
 * check and the write cannot be split. No account, or too little, is
 * `insufficient_credits` with the available balance (0 with no account).
 */
export const holdForChat = async (
  userId: string,
  messageId: string,
  amount: number,
): Promise<
  Result<
    { readonly holdId: string },
    { readonly code: "insufficient_credits"; readonly available: number }
  >
> => {
  const holdId = newId();
  const [held, account] = await db.batch([
    db.execute(sql`
      WITH a AS (
        UPDATE credit_account
        SET held = held + ${amount}::int, last_activity_at = now(), updated_at = now()
        WHERE user_id = ${userId}::uuid AND balance - held >= ${amount}::int
        RETURNING user_id
      )
      INSERT INTO credit_hold (id, user_id, purpose, message_id, amount)
      SELECT ${holdId}::uuid, user_id, 'chat', ${messageId}::uuid, ${amount}::int FROM a
      RETURNING id
    `),
    db
      .select({ balance: creditAccount.balance, held: creditAccount.held })
      .from(creditAccount)
      .where(eq(creditAccount.userId, userId)),
  ]);
  if (held.rows.length > 0) return ok({ holdId });
  const a = account[0];
  return err({
    code: "insufficient_credits",
    available: a ? a.balance - a.held : 0,
  });
};

/**
 * Settles a chat hold once (AC-10). `charged > 0`: the hold becomes `charged` with
 * `min(charged, amount)`, the account `balance -= charged, held -= amount` (the rest is
 * released in the same update), and one `chat_charge` ledger entry, key
 * `charge:<holdId>`. `charged = 0`: the hold is released as `chat_error`. A hold that is
 * no longer active changes nothing and returns null; otherwise the account summary
 * after the write. It follows the hold's own `user_id`, so a guest link mid turn is fine.
 */
export const settleChat = async (
  holdId: string,
  charged: number,
): Promise<Summary | null> => {
  const result =
    charged > 0
      ? await db.execute(sql`
          WITH h AS (
            UPDATE credit_hold
            SET status = 'charged', charged_amount = LEAST(${charged}::int, amount), settled_at = now()
            WHERE id = ${holdId}::uuid AND status = 'active' AND purpose = 'chat'
            RETURNING id, user_id, amount, charged_amount
          ), a AS (
            UPDATE credit_account acc
            SET balance = acc.balance - h.charged_amount, held = acc.held - h.amount,
                last_activity_at = now(), updated_at = now()
            FROM h WHERE acc.user_id = h.user_id
            RETURNING acc.user_id, acc.balance, acc.held, acc.last_activity_at
          ), l AS (
            INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, hold_id, idempotency_key)
            SELECT ${newId()}::uuid, a.user_id, 'chat_charge', -h.charged_amount, a.balance, h.id, 'charge:' || h.id
            FROM h JOIN a ON a.user_id = h.user_id
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id
          )
          SELECT balance, held, last_activity_at FROM a
        `)
      : await db.execute(sql`
          WITH h AS (
            UPDATE credit_hold
            SET status = 'released', release_reason = 'chat_error', settled_at = now()
            WHERE id = ${holdId}::uuid AND status = 'active' AND purpose = 'chat'
            RETURNING user_id, amount
          ), a AS (
            UPDATE credit_account acc
            SET held = acc.held - h.amount, updated_at = now()
            FROM h WHERE acc.user_id = h.user_id
            RETURNING acc.balance, acc.held, acc.last_activity_at
          )
          SELECT balance, held, last_activity_at FROM a
        `);
  const row = result.rows[0] as
    | { balance: number; held: number; last_activity_at: string | Date }
    | undefined;
  if (!row) return null;
  const balance = Number(row.balance);
  const held = Number(row.held);
  return {
    balance,
    held,
    available: balance - held,
    lastActivityAt:
      row.last_activity_at instanceof Date
        ? row.last_activity_at.toISOString()
        : String(row.last_activity_at),
  };
};

/**
 * The daily sweep of stale holds (spec 0004, AC-7, AC-10), one statement per kind:
 * - run holds whose run has had no activity (`tool_run.updated_at`) for `idleDays`, and
 *   whose report is not `generating`, are released as `idle`;
 * - chat holds still active `chatStaleMinutes` after they were placed (a timeout, a
 *   disconnect, a crash) are released as `chat_error`.
 * Nothing is charged. Returns how many of each were released.
 */
export const releaseIdleHolds = async (
  idleDays: number,
  chatStaleMinutes: number,
): Promise<{ readonly idle: number; readonly chat: number }> => {
  const idleRuns = sql`
    SELECT h.run_id FROM credit_hold h
    JOIN tool_run r ON r.id = h.run_id
    WHERE h.status = 'active' AND h.purpose = 'run'
      AND r.updated_at < now() - make_interval(days => ${idleDays}::int)
      AND NOT EXISTS (
        SELECT 1 FROM report p WHERE p.run_id = r.id AND p.status = 'generating'
      )
  `;
  const [runs, chats] = await db.batch([
    db.execute(sql`
      WITH ${releaseRunHoldCtes(idleRuns, "idle")}
      SELECT count(*)::int AS released FROM rh
    `),
    db.execute(sql`
      WITH h AS (
        UPDATE credit_hold
        SET status = 'released', release_reason = 'chat_error', settled_at = now()
        WHERE status = 'active' AND purpose = 'chat'
          AND created_at < now() - make_interval(mins => ${chatStaleMinutes}::int)
        RETURNING user_id, amount
      ), a AS (
        UPDATE credit_account acc
        SET held = acc.held - x.total, updated_at = now()
        FROM (SELECT user_id, sum(amount)::int AS total FROM h GROUP BY user_id) x
        WHERE acc.user_id = x.user_id
        RETURNING acc.user_id
      )
      SELECT count(*)::int AS released FROM h
    `),
  ]);
  const count = (r: { rows: unknown[] }) =>
    Number((r.rows[0] as { released?: number } | undefined)?.released ?? 0);
  return { idle: count(runs), chat: count(chats) };
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

/** The starter grant statement `ensureAccount` runs, reused inside larger batches. */
const ensureAccountStatement = (userId: string, starterGrant: number) =>
  db.execute(sql`
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

export type ClaimedGrants = {
  /** False for a guest or an unverified email: only the account was ensured. */
  readonly eligible: boolean;
  readonly starter: number;
  readonly signup: number;
  readonly luna: number;
};

const amountOf = (r: { rows: unknown[] }, column: string): number =>
  Number((r.rows[0] as Record<string, unknown> | undefined)?.[column] ?? 0);

/**
 * Opens the account if needed (starter grant) and claims what a verified account is owed,
 * once ever (spec 0004, AC-11, AC-16), in one batch:
 * - the sign up grant, only when the email's keyed hash is new to `signup_grant_claim`
 *   (that row outlives the account, so a deleted and re-created email gets nothing);
 * - the Luna import for this email, only while it is unclaimed (bumps `last_activity_at`).
 * Idempotent: the claim row, the import's `claimed_at` and the ledger keys
 * (`signup:<userId>`, `luna:<importId>`) make a repeat a no-op. `hashEmail` returns null
 * when the hash key is not set, which skips the sign up grant.
 */
export const claimPendingGrants = async (
  userId: string,
  opts: {
    readonly starter: number;
    readonly signup: number;
    readonly hashEmail: (email: string) => string | null;
  },
): Promise<ClaimedGrants> => {
  const [who] = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (!who || !who.emailVerified || who.isAnonymous === true) {
    const opened = await ensureAccount(userId, opts.starter);
    return { eligible: false, starter: opened.granted, signup: 0, luna: 0 };
  }
  const email = who.email.trim().toLowerCase();
  const hash = opts.signup > 0 ? opts.hashEmail(email) : null;
  // Built in ledger order: each statement takes its UUID v7 when built, and entries
  // written in one commit share `created_at`, so the id orders them in the history.
  const ensureStatement = ensureAccountStatement(userId, opts.starter);
  const signupStatement =
    hash === null
      ? db.execute(sql`SELECT 0 AS amount WHERE false`)
      : db.execute(sql`
          WITH c AS (
            INSERT INTO signup_grant_claim (email_hash) VALUES (${hash})
            ON CONFLICT (email_hash) DO NOTHING
            RETURNING email_hash
          ), a AS (
            UPDATE credit_account
            SET balance = balance + ${opts.signup}::int, updated_at = now()
            WHERE user_id = ${userId}::uuid AND EXISTS (SELECT 1 FROM c)
            RETURNING user_id, balance
          ), l AS (
            INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
            SELECT ${newId()}::uuid, user_id, 'signup_grant', ${opts.signup}::int, balance,
                   'signup:' || user_id
            FROM a
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING amount
          )
          SELECT amount FROM l
        `);
  const [opened, signup, luna] = await db.batch([
    ensureStatement,
    signupStatement,
    db.execute(sql`
      WITH i AS (
        UPDATE luna_credit_import
        SET claimed_by_user_id = ${userId}::uuid, claimed_at = now()
        WHERE email = ${email} AND claimed_at IS NULL
        RETURNING id, credits
      ), a AS (
        UPDATE credit_account acc
        SET balance = acc.balance + i.credits, last_activity_at = now(), updated_at = now()
        FROM i WHERE acc.user_id = ${userId}::uuid
        RETURNING acc.user_id, acc.balance, i.id AS import_id, i.credits
      ), l AS (
        INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
        SELECT ${newId()}::uuid, user_id, 'luna_import', credits, balance, 'luna:' || import_id
        FROM a
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING amount
      )
      SELECT amount FROM l
    `),
  ]);
  return {
    eligible: true,
    starter: amountOf(opened, "balance"),
    signup: amountOf(signup, "amount"),
    luna: amountOf(luna, "amount"),
  };
};

export type AdjustError =
  | { readonly code: "user_not_found" }
  | {
      readonly code: "would_go_below_held";
      readonly balance: number;
      readonly held: number;
    };

type AccountRow = {
  balance: number;
  held: number;
  last_activity_at: string | Date;
};

const toSummary = (row: AccountRow): Summary => {
  const balance = Number(row.balance);
  const held = Number(row.held);
  return {
    balance,
    held,
    available: balance - held,
    lastActivityAt:
      row.last_activity_at instanceof Date
        ? row.last_activity_at.toISOString()
        : String(row.last_activity_at),
  };
};

/**
 * A staff correction (spec 0004, AC-17): one `adjustment` ledger entry with its reason
 * and actor, key `adjust:<uuid>` (new per call). Refuses, changing nothing, a change that
 * would leave the balance below what is held (which also keeps it at 0 or more). Does not
 * reset the expiry clock. The caller opens the account first if the user has none.
 */
export const adjust = async (
  userId: string,
  amount: number,
  reason: string,
  actor: string,
): Promise<Result<Summary, AdjustError>> => {
  const [changed, account] = await db.batch([
    db.execute(sql`
      WITH a AS (
        UPDATE credit_account
        SET balance = balance + ${amount}::int, updated_at = now()
        WHERE user_id = ${userId}::uuid AND balance + ${amount}::int >= held
        RETURNING user_id, balance, held, last_activity_at
      ), l AS (
        INSERT INTO credit_ledger
          (id, user_id, kind, amount, balance_after, reason, actor, idempotency_key)
        SELECT ${newId()}::uuid, user_id, 'adjustment', ${amount}::int, balance,
               ${reason}, ${actor}, ${`adjust:${newId()}`}
        FROM a
        RETURNING id
      )
      SELECT balance, held, last_activity_at FROM a
    `),
    db
      .select({ balance: creditAccount.balance, held: creditAccount.held })
      .from(creditAccount)
      .where(eq(creditAccount.userId, userId)),
  ]);
  const row = changed.rows[0] as AccountRow | undefined;
  if (row) return ok(toSummary(row));
  const current = account[0];
  return current
    ? err({
        code: "would_go_below_held",
        balance: current.balance,
        held: current.held,
      })
    : err({ code: "user_not_found" });
};

/** The id of the user with this email (staff scripts only), or null. */
export const userIdByEmail = async (email: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`);
  return row?.id ?? null;
};

/**
 * Loads the Luna balances (spec 0004, AC-16) in one statement. An email already imported
 * is skipped, never changed, so running the same file twice imports nothing new.
 */
export const importLunaCredits = async (
  rows: readonly {
    readonly email: string;
    readonly lunaCredits: number;
    readonly credits: number;
  }[],
): Promise<{ readonly imported: number; readonly skipped: number }> => {
  if (rows.length === 0) return { imported: 0, skipped: 0 };
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${newId()}::uuid, ${r.email}, ${r.lunaCredits}::int, ${r.credits}::int)`,
    ),
    sql`, `,
  );
  const result = await db.execute(sql`
    INSERT INTO luna_credit_import (id, email, luna_credits, credits)
    VALUES ${values}
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `);
  return {
    imported: result.rows.length,
    skipped: rows.length - result.rows.length,
  };
};

/**
 * Accounts whose balance has expired (spec 0004, AC-15): a balance above 0, nothing held,
 * and the Lagos calendar date of `last_activity_at` plus `months` is today or earlier.
 * Postgres month arithmetic clamps the day (31 Jan + 1 month = 28 or 29 Feb), like
 * `addMonths` in `billing/pricing.ts`.
 */
const expiredAccounts = (months: number, timeZone: string) => sql`
  SELECT user_id, balance, last_activity_at FROM credit_account
  WHERE balance > 0 AND held = 0
    AND ((last_activity_at AT TIME ZONE ${timeZone})::date
         + make_interval(months => ${months}::int))::date
        <= (now() AT TIME ZONE ${timeZone})::date
`;

/**
 * The daily expiry job (AC-15). With `enforce` off it only counts what would expire.
 * With it on, each expired account gets one `expiry` entry of `-balance` (key
 * `expiry:<userId>:<lastActivityAt>`, so a replay changes nothing) and its balance goes to
 * 0, in one statement. Rows other work holds a lock on are skipped until tomorrow.
 */
export const expireInactive = async (
  months: number,
  timeZone: string,
  enforce: boolean,
): Promise<{
  readonly due: number;
  readonly expired: number;
  readonly credits: number;
}> => {
  if (!enforce) {
    const result = await db.execute(sql`
      SELECT count(*)::int AS due, COALESCE(sum(balance), 0)::int AS credits
      FROM (${expiredAccounts(months, timeZone)}) e
    `);
    return {
      due: amountOf(result, "due"),
      expired: 0,
      credits: amountOf(result, "credits"),
    };
  }
  const result = await db.execute(sql`
    WITH e AS (
      ${expiredAccounts(months, timeZone)}
      FOR UPDATE SKIP LOCKED
    ), l AS (
      INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
      SELECT gen_random_uuid(), user_id, 'expiry', -balance, 0,
             'expiry:' || user_id || ':' || last_activity_at::text
      FROM e
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING user_id, amount
    ), a AS (
      UPDATE credit_account acc
      SET balance = 0, updated_at = now()
      FROM l WHERE acc.user_id = l.user_id
      RETURNING acc.user_id
    )
    SELECT count(*)::int AS expired, COALESCE(-sum(l.amount), 0)::int AS credits
    FROM l JOIN a ON a.user_id = l.user_id
  `);
  const expired = amountOf(result, "expired");
  return { due: expired, expired, credits: amountOf(result, "credits") };
};

export type Drift = {
  readonly userId: string;
  readonly balance: number;
  readonly ledgerSum: number;
  readonly held: number;
  readonly activeHeld: number;
};

/** Accounts whose ledger sum is not their balance, or whose `held` is not their active holds. */
const driftQuery = (only: readonly string[] | null) => sql`
  SELECT a.user_id, a.balance, a.held,
         COALESCE(l.total, 0)::int AS ledger_sum,
         COALESCE(h.total, 0)::int AS active_held
  FROM credit_account a
  LEFT JOIN (
    SELECT user_id, sum(amount) AS total FROM credit_ledger GROUP BY user_id
  ) l ON l.user_id = a.user_id
  LEFT JOIN (
    SELECT user_id, sum(amount) AS total FROM credit_hold
    WHERE status = 'active' GROUP BY user_id
  ) h ON h.user_id = a.user_id
  WHERE (a.balance <> COALESCE(l.total, 0) OR a.held <> COALESCE(h.total, 0))
  ${only === null ? sql`` : sql`AND a.user_id = ANY(${`{${only.join(",")}}`}::uuid[])`}
`;

const toDrift = (r: unknown): Drift => {
  const row = r as {
    user_id: string;
    balance: number;
    held: number;
    ledger_sum: number;
    active_held: number;
  };
  return {
    userId: row.user_id,
    balance: Number(row.balance),
    ledgerSum: Number(row.ledger_sum),
    held: Number(row.held),
    activeHeld: Number(row.active_held),
  };
};

/**
 * The daily drift check (spec 0004, AC-20): both sums in one statement (one snapshot),
 * then each hit checked once more, so a money write that landed between the reads is
 * not reported. Returns only the users that still fail. Never repairs anything: staff
 * fix with `credits:adjust`.
 */
export const findDrift = async (): Promise<readonly Drift[]> => {
  const first = await db.execute(driftQuery(null));
  if (first.rows.length === 0) return [];
  const again = await db.execute(
    driftQuery(first.rows.map((r) => toDrift(r).userId)),
  );
  return again.rows.map(toDrift);
};

export type LedgerEntry = {
  readonly id: string;
  readonly kind: (typeof creditLedger.$inferSelect)["kind"];
  readonly amount: number;
  readonly balanceAfter: number;
  readonly createdAt: string;
};

/**
 * One page of the user's credit history (spec 0004, AC-14), newest first, by keyset on
 * `(created_at, id)` (the `credit_ledger_user_created_idx` index). Pass the last entry of
 * the previous page as `after`. Reads `limit + 1` rows so the caller knows whether an
 * older page exists. Owner scoped: only the user's own entries.
 */
export const listLedger = async (
  userId: string,
  after: { readonly createdAt: string; readonly id: string } | null,
  limit: number,
): Promise<{
  readonly entries: readonly LedgerEntry[];
  readonly hasMore: boolean;
}> => {
  const rows = await db
    .select({
      id: creditLedger.id,
      kind: creditLedger.kind,
      amount: creditLedger.amount,
      balanceAfter: creditLedger.balanceAfter,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        after === null
          ? undefined
          : sql`(${creditLedger.createdAt}, ${creditLedger.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`,
      ),
    )
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit + 1);
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
};
