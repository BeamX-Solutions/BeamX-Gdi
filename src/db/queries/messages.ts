import { sql } from "drizzle-orm";
import { db } from "../client";
import { conversation } from "../schema";
import { err, ok, type Result } from "@/lib/result";

export type NewMessage = {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: unknown;
  readonly metadata?: unknown;
};

export type MessageError = { readonly code: "not_found" };

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
    RETURNING id
  `);

  const [touched, inserted] = await db.batch([touch, insert]);
  if (touched.length === 0) return err({ code: "not_found" });
  return ok(inserted.rows.length);
};

export const countForConversation = async (conversationId: string) => {
  const rows = await db.execute(
    sql`SELECT count(*)::int AS n FROM message WHERE conversation_id = ${conversationId}::uuid`,
  );
  return Number((rows.rows[0] as { n: number } | undefined)?.n ?? 0);
};
