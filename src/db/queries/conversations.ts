import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { conversation, message, report, toolRun } from "../schema";
import { err, ok } from "@/lib/result";

export type ConversationError = { readonly code: "not_found" };

export const create = async (userId: string, title?: string) => {
  const rows = await db
    .insert(conversation)
    .values({ id: newId(), userId, title: title ?? null })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("conversation insert returned no row");
  return row;
};

/** One round trip: ownership check, latest messages (oldest first), runs with reports. */
export const open = async (
  userId: string,
  conversationId: string,
  limit = 100,
) => {
  const [owned, latest, runs] = await db.batch([
    db
      .select()
      .from(conversation)
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.userId, userId),
        ),
      ),
    db
      .select({ message })
      .from(message)
      .innerJoin(
        conversation,
        and(
          eq(conversation.id, message.conversationId),
          eq(conversation.userId, userId),
        ),
      )
      .where(eq(message.conversationId, conversationId))
      .orderBy(desc(message.seq))
      .limit(limit),
    db
      .select({ run: toolRun, report })
      .from(toolRun)
      .leftJoin(report, eq(report.runId, toolRun.id))
      .where(
        and(
          eq(toolRun.conversationId, conversationId),
          eq(toolRun.userId, userId),
        ),
      )
      .orderBy(desc(toolRun.createdAt)),
  ]);
  const conv = owned[0];
  if (!conv) return err<ConversationError>({ code: "not_found" });
  return ok({
    conversation: conv,
    messages: latest.map((r) => r.message).reverse(),
    runs,
  });
};
