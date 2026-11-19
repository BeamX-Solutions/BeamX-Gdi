import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../client";
import { conversation, message } from "../schema";
import { decodeCursor, dedupeById, isUuid, toPage } from "./codecs";
import { err, ok, type Result } from "@/lib/result";

export { decodeCursor, encodeCursor, toPage } from "./codecs";

export type NewMessage = {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: unknown;
  readonly metadata?: unknown;
};

export type MessageError = { readonly code: "not_found" };
export type ListError =
  { readonly code: "not_found" } | { readonly code: "invalid_cursor" };

export const DEFAULT_PAGE = 100;

/** Newest first, one extra row to learn whether an older page exists. */
export const pageQuery = (
  userId: string,
  conversationId: string,
  beforeSeq: number | null,
  limit: number,
) =>
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
    .where(
      and(
        eq(message.conversationId, conversationId),
        beforeSeq === null ? undefined : lt(message.seq, beforeSeq),
      ),
    )
    .orderBy(desc(message.seq))
    .limit(limit + 1);

type MessageRow = typeof message.$inferSelect;

export const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(limit ?? DEFAULT_PAGE, 1), 500);

/**
 * One batch: the first statement is the ownership signal (zero rows = not_found),
 * the second upserts the messages, joined to the owned conversation. A repeated id in
 * `messages` keeps its last entry. Returns the number of rows written.
 */
export const append = async (
  userId: string,
  conversationId: string,
  messages: readonly NewMessage[],
): Promise<Result<number, MessageError>> => {
  if (!isUuid(conversationId)) return err({ code: "not_found" });
  const touch = db
    .update(conversation)
    .set({
      lastMessageAt: sql`GREATEST(${conversation.lastMessageAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${conversation.id} = ${conversationId} AND ${conversation.userId} = ${userId}`,
    )
    .returning({ id: conversation.id });

  if (messages.length === 0) {
    const [rows] = await db.batch([touch]);
    return rows.length === 0 ? err({ code: "not_found" }) : ok(0);
  }

  const values = sql.join(
    dedupeById(messages).map(
      (m) =>
        sql`(${m.id}::uuid, ${m.role}::message_role, ${JSON.stringify(m.parts)}::jsonb, ${m.metadata === undefined ? null : JSON.stringify(m.metadata)}::jsonb)`,
    ),
    sql`, `,
  );
  const insert = db.execute(sql`
    INSERT INTO message (id, conversation_id, role, parts, metadata)
    SELECT v.id, c.id, v.role, v.parts, v.metadata
    FROM (VALUES ${values}) AS v(id, role, parts, metadata)
    JOIN conversation c ON c.id = ${conversationId}::uuid AND c.user_id = ${userId}::uuid
    ON CONFLICT (id) DO UPDATE
      SET parts = excluded.parts, metadata = excluded.metadata, updated_at = now()
      WHERE message.conversation_id = excluded.conversation_id
    RETURNING id
  `);

  const [touched, inserted] = await db.batch([touch, insert]);
  if (touched.length === 0) return err({ code: "not_found" });
  return ok(inserted.rows.length);
};

/** Oldest first within the page; `before` is the opaque cursor from a previous page. */
export const listRecent = async (
  userId: string,
  conversationId: string,
  before?: string,
  limit?: number,
): Promise<
  Result<{ messages: MessageRow[]; nextCursor: string | null }, ListError>
> => {
  if (!isUuid(conversationId)) return err({ code: "not_found" });
  const beforeSeq = before === undefined ? null : decodeCursor(before);
  if (before !== undefined && beforeSeq === null)
    return err({ code: "invalid_cursor" });
  const size = clampLimit(limit);
  const [owned, rows] = await db.batch([
    db
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.userId, userId),
        ),
      ),
    pageQuery(userId, conversationId, beforeSeq, size),
  ]);
  if (owned.length === 0) return err({ code: "not_found" });
  return ok(toPage(rows, size));
};
