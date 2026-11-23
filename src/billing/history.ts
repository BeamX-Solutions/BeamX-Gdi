/**
 * The `/credits` history (spec 0004, AC-14): 20 entries a page, newest first, older pages
 * by an opaque keyset cursor. Pure.
 */
import { z } from "zod";

export const HISTORY_PAGE_SIZE = 20;

export type Cursor = { readonly createdAt: string; readonly id: string };

const cursorSchema = z.object({
  c: z.string().min(1).max(64),
  i: z.uuid(),
});

/** The cursor for the page after `last` (the oldest entry shown). */
export const encodeCursor = (last: Cursor): string =>
  Buffer.from(JSON.stringify({ c: last.createdAt, i: last.id })).toString(
    "base64url",
  );

/**
 * The cursor from the `cursor` query value, or null (first page) when absent or not one
 * we made. The timestamp is kept as the raw string the DB gave, so no microseconds are
 * lost.
 */
export const decodeCursor = (
  value: string | string[] | null | undefined,
): Cursor | null => {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const json: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const parsed = cursorSchema.safeParse(json);
    if (!parsed.success || Number.isNaN(Date.parse(parsed.data.c))) return null;
    return { createdAt: parsed.data.c, id: parsed.data.i };
  } catch {
    return null;
  }
};

export type LedgerKind =
  | "starter_grant"
  | "signup_grant"
  | "purchase"
  | "run_charge"
  | "chat_charge"
  | "expiry"
  | "adjustment"
  | "luna_import"
  | "guest_grant_forfeit";

/** What each history line says. */
export const ledgerLabel = (kind: LedgerKind): string => {
  switch (kind) {
    case "starter_grant":
      return "Starter credits";
    case "signup_grant":
      return "Sign up bonus";
    case "purchase":
      return "Credits bought";
    case "run_charge":
      return "Tool run";
    case "chat_charge":
      return "Chat message";
    case "expiry":
      return "Credits expired";
    case "adjustment":
      return "Adjustment by BeamX";
    case "luna_import":
      return "Moved from Luna";
    case "guest_grant_forfeit":
      return "Unused guest credits";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
};

/** "+100", "−30": the signed amount with a real minus sign. */
export const signedAmount = (amount: number): string =>
  amount > 0
    ? `+${amount.toLocaleString("en-NG")}`
    : `−${Math.abs(amount).toLocaleString("en-NG")}`;
