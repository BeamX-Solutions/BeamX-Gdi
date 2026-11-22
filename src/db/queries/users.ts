import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { account, aiUsage, conversation, toolRun, user } from "../schema";
import { linkGuestCreditStatements } from "./credits";
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
] as const;
/** Better Auth owns these; its own link flow deals with the guest's session. */
export const LINK_EXCLUDED_TABLES = ["session", "account"] as const;

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

/** Whether an email already belongs to an account (spec 0009, AC-8). */
export type EmailStatus = "none" | "exists" | "google_only";

/**
 * The account behind a lowercased email, for the sign up form's email check: `none`
 * (free to sign up), `exists` (has a password; sign in instead), or `google_only` (made
 * with Google; use Google or Forgot password to add one). Guests never count. One round
 * trip.
 */
export const emailStatus = async (email: string): Promise<EmailStatus> => {
  const [row] = await db
    .select({
      hasPassword: sql<boolean>`bool_or(${account.providerId} = 'credential')`,
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
  return row.hasPassword ? "exists" : "google_only";
};
