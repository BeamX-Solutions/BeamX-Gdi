import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { conversation, message } from "../schema";
import { err, ok, type Result } from "@/lib/result";

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

export const encodeCursor = (seq: number): string =>
  Buffer.from(String(seq)).toString("base64url");

export const decodeCursor = (cursor: string): number | null => {
  const n = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

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

/** Turns a newest first page (with the extra row) into oldest first plus `nextCursor`. */
export const toPage = (
  rows: readonly { message: MessageRow }[],
  limit: number,
) => {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map((r) => r.message);
  const oldest = page.at(-1);
  return {
    messages: page.reverse(),
    nextCursor: hasMore && oldest ? encodeCursor(oldest.seq) : null,
  };
};

export const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(limit ?? DEFAULT_PAGE, 1), 500);

/**
 * One batch: the first statement is the ownership signal (zero rows = not_found),
 * the second upserts the messages, joined to the owned conversation.
 */
export const append = async (
  userId: string,
  conversationId: string,
  messages: readonly NewMessage[],
): Promise<Result<number, MessageError>> => {
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
    messages.map(
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
        AND message.role = excluded.role
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

/**
 * Statement builder: how many of the owner's user messages in the chat carry a typed
 * `text` part and were written after `since` (spec 0007, AC-8). Card and approval taps
 * have no text part, so they never count. `since` is a SQL expression, so a caller can
 * pass a subquery (the active run's `created_at`); a null `since` counts nothing.
 */
export const typedUserCountSince = (
  userId: string,
  conversationId: string,
  since: SQL,
) =>
  db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM message m
    JOIN conversation c ON c.id = m.conversation_id AND c.user_id = ${userId}::uuid
    WHERE m.conversation_id = ${conversationId}::uuid
      AND m.role = 'user'
      AND m.parts @> '[{"type":"text"}]'::jsonb
      AND m.created_at > (${since})
  `);

/**
 * Statement builder: whether the owner's user message `messageId` is already saved in
 * the chat, and whether an assistant message was saved after it (spec 0007, the
 * "Send again" review fix). A resent message that is saved skips the per run limit (it
 * was counted when it came in); one that is also answered runs no second AI turn.
 */
export const userMessageState = (
  userId: string,
  conversationId: string,
  messageId: string,
) =>
  db.execute<{ saved: boolean; answered: boolean }>(sql`
    SELECT
      u.id IS NOT NULL AS saved,
      EXISTS (
        SELECT 1 FROM message a
        WHERE a.conversation_id = ${conversationId}::uuid
          AND a.role = 'assistant'
          AND a.seq > u.seq
      ) AS answered
    FROM (SELECT 1) AS one
    LEFT JOIN message u
      ON u.id = ${messageId}::uuid
      AND u.conversation_id = ${conversationId}::uuid
      AND u.role = 'user'
      AND EXISTS (
        SELECT 1 FROM conversation c
        WHERE c.id = u.conversation_id AND c.user_id = ${userId}::uuid
      )
  `);
