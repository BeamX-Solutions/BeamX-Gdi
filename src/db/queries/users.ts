import { eq } from "drizzle-orm";
import { db } from "../client";
import { aiUsage, conversation, toolRun, user } from "../schema";
import { logEvent } from "@/lib/log";

/**
 * Every table with a foreign key to `user.id` must be listed in exactly one place:
 * moved on guest link (`LINKED_TABLES`) or left alone on purpose (`LINK_EXCLUDED_TABLES`).
 * A test reads the real foreign keys and fails if one is missing from both lists.
 * Features #9, #16, #17 and #18 add their tables here.
 */
export const LINKED_TABLES = ["conversation", "tool_run", "ai_usage"] as const;
/** Better Auth owns these; its own link flow deals with the guest's session. */
export const LINK_EXCLUDED_TABLES = ["session", "account"] as const;

export type LinkCounts = {
  readonly conversation: number;
  readonly toolRun: number;
  readonly aiUsage: number;
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
  const [conversations, runs, usage] = await db.batch([
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
  ]);
  const counts = {
    conversation: conversations.length,
    toolRun: runs.length,
    aiUsage: usage.length,
  };
  logEvent("guest_linked", {
    guestUserId,
    newUserId,
    conversations: counts.conversation,
    toolRuns: counts.toolRun,
    aiUsage: counts.aiUsage,
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
