import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  account,
  aiUsage,
  consultation,
  conversation,
  toolRun,
  user,
} from "../schema";
import { linkGuestCreditStatements } from "./credits";
import { linkGuestPolicyStatement } from "./policies";
import { linkGuestProfileStatements } from "./profile";
import { runInBatches } from "@/lib/batches";
import { logEvent } from "@/lib/log";

/**
 * Every table with a foreign key to `user.id` must be listed in exactly one place:
 * moved on guest link (`LINKED_TABLES`) or left alone on purpose (`LINK_EXCLUDED_TABLES`).
 * A test reads the real foreign keys and fails if one is missing from both lists.
 * Features #9, #16, #17 and #18 add their tables here.
 */
export const LINKED_TABLES = [
  "conversation",
  "tool_run",
  "ai_usage",
  "credit_account",
  "credit_ledger",
  "credit_hold",
  // Merged, not moved (spec 0012, AC-10): see `linkGuestProfileStatements`.
  "business_profile",
  "consultation",
  // Spec 0017: a guest never has rows, but a row the guest holds moves with them.
  "policy_acceptance",
] as const;
/**
 * Left alone on purpose: Better Auth owns `session` and `account` (its own link flow
 * deals with the guest's session); `luna_credit_import` is claimed only by a verified
 * account, never by a guest (spec 0004, AC-16); a `payment` is only ever started by a
 * signed in account, never a guest (spec 0004, AC-13).
 */
export const LINK_EXCLUDED_TABLES = [
  "session",
  "account",
  "luna_credit_import",
  "payment",
] as const;

export type LinkCounts = {
  readonly conversation: number;
  readonly toolRun: number;
  readonly aiUsage: number;
  readonly creditLedger: number;
  readonly creditHolds: number;
};

/**
 * Server only (`onLinkAccount`). Moves every row the guest owns to the new user in one
 * atomic batch. Idempotent (a second call moves nothing). Any failure throws, so the
 * caller must let it propagate: Better Auth then aborts before deleting the guest.
 */
export const linkGuest = async (
  guestUserId: string,
  newUserId: string,
): Promise<LinkCounts> => {
  const [conversations, runs, usage, , , , ledger, holds] = await db.batch([
    db
      .update(conversation)
      .set({ userId: newUserId })
      .where(eq(conversation.userId, guestUserId))
      .returning({ id: conversation.id }),
    db
      .update(toolRun)
      .set({ userId: newUserId })
      .where(eq(toolRun.userId, guestUserId))
      .returning({ id: toolRun.id }),
    db
      .update(aiUsage)
      .set({ userId: newUserId })
      .where(eq(aiUsage.userId, guestUserId))
      .returning({ id: aiUsage.id }),
    ...linkGuestCreditStatements(guestUserId, newUserId),
    // Spec 0012, AC-10: the guest profile merges into the account, then goes.
    ...linkGuestProfileStatements(guestUserId, newUserId),
    // Spec 0016: an offered or booked call follows its chat. Kept last so the counts
    // above keep their positions.
    db
      .update(consultation)
      .set({ userId: newUserId })
      .where(eq(consultation.userId, guestUserId)),
    linkGuestPolicyStatement(guestUserId, newUserId),
  ]);
  const counts = {
    conversation: conversations.length,
    toolRun: runs.length,
    aiUsage: usage.length,
    creditLedger: ledger.rows.length,
    creditHolds: holds.rows.length,
  };
  logEvent("guest_linked", {
    guestUserId,
    newUserId,
    conversations: counts.conversation,
    toolRuns: counts.toolRun,
    aiUsage: counts.aiUsage,
    creditLedger: counts.creditLedger,
    creditHolds: counts.creditHolds,
  });
  return counts;
};

/**
 * Deletes a user. Every owned row goes by cascade; `ai_usage` rows stay with a null
 * `user_id`. Returns false when there was no such user.
 */
export const deleteAccount = async (userId: string): Promise<boolean> => {
  const deleted = await db
    .delete(user)
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  logEvent("user_deleted", { userId, deleted: deleted.length > 0 });
  return deleted.length > 0;
};

/** The daily guest purge (spec 0009, AC-14). */
export const PURGE = {
  staleDays: 30,
  batchSize: 50,
  budgetMs: 120_000,
} as const;

/**
 * One purge batch: deletes up to `limit` guests whose last activity (the newest of the
 * user row, their sessions, chats and runs) is older than `staleDays`, and who have no
 * active credit hold and no report generating. Never touches a non guest. Rows locked
 * by other work are skipped for now. Everything they own goes by cascade. Returns how
 * many went and the guest credits they forfeited. One round trip.
 */
export const deleteStaleGuests = async (
  limit: number,
  staleDays: number = PURGE.staleDays,
): Promise<{ readonly count: number; readonly total: number }> => {
  const result = await db.execute(sql`
    WITH stale AS (
      SELECT u.id,
        COALESCE((SELECT ca.balance FROM credit_account ca WHERE ca.user_id = u.id), 0)
          AS balance
      FROM "user" u
      WHERE u.is_anonymous IS TRUE
        AND GREATEST(
          u.updated_at,
          (SELECT max(s.updated_at) FROM session s WHERE s.user_id = u.id),
          (SELECT max(c.updated_at) FROM conversation c WHERE c.user_id = u.id),
          (SELECT max(t.updated_at) FROM tool_run t WHERE t.user_id = u.id)
        ) < now() - make_interval(days => ${staleDays})
        AND NOT EXISTS (
          SELECT 1 FROM credit_hold h WHERE h.user_id = u.id AND h.status = 'active'
        )
        AND NOT EXISTS (
          SELECT 1 FROM report r JOIN tool_run t ON t.id = r.run_id
          WHERE t.user_id = u.id AND r.status = 'generating'
        )
      LIMIT ${limit}
      FOR UPDATE OF u SKIP LOCKED
    )
    DELETE FROM "user" u USING stale
    WHERE u.id = stale.id AND u.is_anonymous IS TRUE
    RETURNING u.id, stale.balance
  `);
  // Postgres sends the balance back as a number or a numeric string.
  return {
    count: result.rows.length,
    total: result.rows.reduce((sum, row) => sum + Number(row.balance), 0),
  };
};

export type PurgeSummary = {
  readonly deleted: number;
  readonly forfeitedCredits: number;
  readonly batches: number;
  readonly complete: boolean;
};

/**
 * Server only (the daily job). Purges stale guests in batches of 50 within 120 seconds,
 * leaving the rest for the next day, and logs the counts and forfeited credits.
 */
export const purgeUsers = async (
  now: () => number = Date.now,
): Promise<PurgeSummary> => {
  const run = await runInBatches((limit) => deleteStaleGuests(limit), {
    batchSize: PURGE.batchSize,
    budgetMs: PURGE.budgetMs,
    now,
  });
  const summary = {
    deleted: run.count,
    forfeitedCredits: run.total,
    batches: run.batches,
    complete: run.complete,
  };
  logEvent("guests_purged", summary);
  return summary;
};

/** Whether an email already belongs to an account (spec 0009, AC-8). */
export type EmailStatus = "none" | "exists" | "google_only";

/**
 * The account behind a lowercased email, for the sign up form's email check: `none`
 * (free to sign up), `exists` (sign in instead), or `google_only` (made with Google and
 * no password; use Google or Forgot password to add one). An account with neither, from
 * a code sign up closed before the password step, is `exists`: Forgot password on the
 * sign in form sets one (spec 0009). Guests never count. One round trip.
 */
export const emailStatus = async (email: string): Promise<EmailStatus> => {
  const [row] = await db
    .select({
      hasPassword: sql<boolean>`bool_or(${account.providerId} = 'credential')`,
      hasGoogle: sql<boolean>`bool_or(${account.providerId} = 'google')`,
    })
    .from(user)
    .leftJoin(account, eq(account.userId, user.id))
    .where(
      and(
        eq(user.email, email.trim().toLowerCase()),
        // `is_anonymous` may be null for an account: `IS NOT TRUE` keeps those.
        sql`${user.isAnonymous} IS NOT TRUE`,
      ),
    )
    .groupBy(user.id);
  if (row === undefined) return "none";
  // Over the left join, an account with no rows gives null for both: not Google.
  return row.hasGoogle === true && row.hasPassword !== true
    ? "google_only"
    : "exists";
};
