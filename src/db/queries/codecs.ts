import { z } from "zod";
import type { message } from "../schema";

/**
 * Pure helpers for the query layer: id checks, cursor codecs, input normalising.
 * No database import, so unit tests load this file without a connection.
 */

const uuidSchema = z.uuid();

/**
 * True for a well formed UUID. Query functions check URL derived ids with it first, so
 * a junk id returns a typed `not_found` instead of a Postgres `22P02` thrown error.
 */
export const isUuid = (value: string): boolean =>
  uuidSchema.safeParse(value).success;

/** Message page cursor: the `seq` of the oldest message on the previous page. */
export const encodeCursor = (seq: number): string =>
  Buffer.from(String(seq)).toString("base64url");

export const decodeCursor = (cursor: string): number | null => {
  const raw = Buffer.from(cursor, "base64url").toString();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * A Postgres `timestamptz` in text form, as Drizzle returns it with `mode: "string"`
 * (`2026-11-18 06:08:07.123456+00`), or ISO 8601. Rejects impossible dates such as
 * Feb 31, which Postgres would refuse with a thrown error.
 */
const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[ T]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{1,6})?(Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)$/;

export const isTimestamp = (value: string): boolean => {
  const m = TIMESTAMP.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
};

/** Conversation list cursor: the `(last_message_at, id)` of the last row on the page. */
export const encodeListCursor = (c: {
  readonly lastMessageAt: string;
  readonly id: string;
}): string =>
  Buffer.from(JSON.stringify([c.lastMessageAt, c.id])).toString("base64url");

const listCursorSchema = z.tuple([
  z.string().refine(isTimestamp),
  z.string().refine(isUuid),
]);

export const decodeListCursor = (
  cursor: string,
): readonly [string, string] | null => {
  try {
    const parsed = listCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString()),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

type MessageRow = typeof message.$inferSelect;

/** Turns a newest first page (with one extra row) into oldest first plus `nextCursor`. */
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

/**
 * One entry per id: the last entry's content, at the first entry's position. A single
 * `INSERT ... ON CONFLICT DO UPDATE` cannot touch a row twice (Postgres `21000`), so a
 * retried or merged batch with a repeated id would otherwise fail as a whole.
 */
export const dedupeById = <T extends { readonly id: string }>(
  items: readonly T[],
): readonly T[] => [...new Map(items.map((i) => [i.id, i])).values()];
