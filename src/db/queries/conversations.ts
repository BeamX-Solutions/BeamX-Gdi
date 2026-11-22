import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { conversation, toolRun } from "../schema";
import {
  clampLimit,
  decodeCursor,
  pageQuery,
  toPage,
  typedUserCountSince,
  userMessageState,
} from "./messages";
import { releaseRunHolds } from "./credit-holds";
import { runsWithReports } from "./reports";
import { activeStatements, toActive } from "./runs";
import { err, ok, type Result } from "@/lib/result";

type ConversationRow = typeof conversation.$inferSelect;

export type ConversationError = { readonly code: "not_found" };
export type OpenError =
  { readonly code: "not_found" } | { readonly code: "invalid_cursor" };

export const create = async (userId: string, title?: string) => {
  const rows = await db
    .insert(conversation)
    .values({ id: newId(), userId, title: title ?? null })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("conversation insert returned no row");
  return row;
};

export const get = async (
  userId: string,
  conversationId: string,
): Promise<Result<ConversationRow, ConversationError>> => {
  const rows = await db
    .select()
    .from(conversation)
    .where(
      and(eq(conversation.id, conversationId), eq(conversation.userId, userId)),
    );
  const row = rows[0];
  return row ? ok(row) : err({ code: "not_found" });
};

/**
 * Server only (`onFinish`, the report step). Reads the conversation's current owner at
 * write time, so a stream that started as a guest and finishes after sign up writes to
 * the linked account (spec 0002, "Writes after a link"). Never pass the session id
 * captured when the stream started: after a link that guest no longer exists.
 */
export const ownerOf = async (
  conversationId: string,
): Promise<Result<string, ConversationError>> => {
  const rows = await db
    .select({ userId: conversation.userId })
    .from(conversation)
    .where(eq(conversation.id, conversationId));
  const row = rows[0];
  return row ? ok(row.userId) : err({ code: "not_found" });
};

export type TurnContext = {
  readonly active: ReturnType<typeof toActive>;
  /** Typed user messages since the active run started; 0 with no active run. */
  readonly typedInRun: number;
  /** The incoming user message: already saved, and answered by a saved reply. */
  readonly message: { readonly saved: boolean; readonly answered: boolean };
  /** This request created the chat (spec 0008, AC-6: a guest's new chat is counted). */
  readonly created: boolean;
};

export type TurnContextError =
  | { readonly code: "other_owner" }
  /** A new chat id, but the guest may not create another chat today (spec 0008). */
  | { readonly code: "chat_limit" };

/**
 * The chat route's one round trip before a turn (spec 0007, step 4), one `db.batch`:
 * create the chat under the client's id if absent and allowed, read its owner, the
 * active and paused runs, the typed message count since the active run started, and
 * whether the incoming message is already saved and answered (a resend).
 *
 * The insert runs first and only when `mayCreate` (spec 0008, AC-6: a guest under the
 * daily new chat limit; always true for signed in users); `created` is true only when
 * this request made the row. An existing chat returns its context whatever `mayCreate`
 * is. The result is the context, `other_owner` when the id belongs to someone else, or
 * `chat_limit` when the chat is new and may not be created (nothing is written then).
 */
export const turnContext = async (
  userId: string,
  conversationId: string,
  messageId: string,
  mayCreate = true,
): Promise<Result<TurnContext, TurnContextError>> => {
  const [inserted, owner, live, answers, typed, state] = await db.batch([
    db.execute<{ id: string }>(sql`
      INSERT INTO conversation (id, user_id)
      SELECT ${conversationId}::uuid, ${userId}::uuid
      WHERE ${mayCreate}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `),
    db
      .select({ userId: conversation.userId })
      .from(conversation)
      .where(eq(conversation.id, conversationId)),
    ...activeStatements(userId, conversationId),
    typedUserCountSince(
      userId,
      conversationId,
      sql`SELECT created_at FROM tool_run WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid AND status = 'in_progress' LIMIT 1`,
    ),
    userMessageState(userId, conversationId, messageId),
  ]);
  const ownerId = owner[0]?.userId;
  if (ownerId === undefined && !mayCreate) return err({ code: "chat_limit" });
  if (ownerId !== userId) return err({ code: "other_owner" });
  return ok({
    active: toActive(live, answers),
    typedInRun: Number(typed.rows[0]?.n ?? 0),
    message: {
      saved: state.rows[0]?.saved === true,
      answered: state.rows[0]?.answered === true,
    },
    created: inserted.rows.length > 0,
  });
};

const encodeListCursor = (c: { lastMessageAt: string; id: string }) =>
  Buffer.from(JSON.stringify([c.lastMessageAt, c.id])).toString("base64url");

const decodeListCursor = (cursor: string): [string, string] | null => {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString(),
    );
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    )
      return [parsed[0], parsed[1]];
    return null;
  } catch {
    return null;
  }
};

/** Newest activity first. Keyset pagination on (last_message_at, id). */
export const list = async (
  userId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<
  Result<
    { items: ConversationRow[]; nextCursor: string | null },
    { readonly code: "invalid_cursor" }
  >
> => {
  const size = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const after =
    options.cursor === undefined ? null : decodeListCursor(options.cursor);
  if (options.cursor !== undefined && after === null)
    return err({ code: "invalid_cursor" });
  const rows = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.userId, userId),
        after
          ? sql`(${conversation.lastMessageAt}, ${conversation.id}) < (${after[0]}::timestamptz, ${after[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
    .limit(size + 1);
  const items = rows.slice(0, size);
  const last = items.at(-1);
  return ok({
    items,
    nextCursor: rows.length > size && last ? encodeListCursor(last) : null,
  });
};

/** One round trip: ownership check, latest messages (oldest first), runs with reports. */
export const open = async (
  userId: string,
  conversationId: string,
  options: { before?: string; limit?: number } = {},
) => {
  const beforeSeq =
    options.before === undefined ? null : decodeCursor(options.before);
  if (options.before !== undefined && beforeSeq === null)
    return err<OpenError>({ code: "invalid_cursor" });
  const size = clampLimit(options.limit);
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
    pageQuery(userId, conversationId, beforeSeq, size),
    runsWithReports(userId, conversationId),
  ]);
  const conv = owned[0];
  if (!conv) return err<OpenError>({ code: "not_found" });
  return ok({ conversation: conv, ...toPage(latest, size), runs });
};

/**
 * One batch: abandon the chat's live runs, then delete the chat. Completed runs and
 * their reports survive with `conversation_id` null.
 */
export const remove = async (
  userId: string,
  conversationId: string,
): Promise<Result<true, ConversationError>> => {
  const [, , deleted] = await db.batch([
    db
      .update(toolRun)
      .set({ status: "abandoned" })
      .where(
        and(
          eq(toolRun.conversationId, conversationId),
          eq(toolRun.userId, userId),
          sql`${toolRun.status} IN ('in_progress', 'paused')`,
        ),
      ),
    // Spec 0004, AC-5: release the abandoned runs' credit holds before the chat goes.
    releaseRunHolds(
      sql`SELECT id FROM tool_run WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid AND status = 'abandoned'`,
      "abandoned",
    ),
    db
      .delete(conversation)
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.userId, userId),
        ),
      )
      .returning({ id: conversation.id }),
  ]);
  return deleted.length === 0 ? err({ code: "not_found" }) : ok(true);
};
