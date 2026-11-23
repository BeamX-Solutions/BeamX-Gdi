import { z } from "zod";
import type { BillingConfig } from "./config";
import { expiryState } from "./pricing";

/**
 * The credits the header chip shows (spec 0007, AC-9): available (balance minus held)
 * and held. Returned with the approval result, the stop result and the report status,
 * so the client parses it at that boundary with this schema.
 */
export const creditSummarySchema = z.object({
  available: z.int(),
  held: z.int().nonnegative(),
});

export type CreditSummary = z.infer<typeof creditSummarySchema>;

/** The chip's numbers from a full account summary, or null with no account. Pure. */
export const toCreditSummary = (
  account: { readonly available: number; readonly held: number } | null,
): CreditSummary | null =>
  account === null
    ? null
    : { available: account.available, held: account.held };

/**
 * The chip's expiry warning dot (spec 0004, AC-15): on from `warnDays` before the balance
 * expires (and after, while expiry is not enforced), never with no account or a 0
 * balance. Pure: `now` is passed in.
 */
export const expiryWarning = (
  account: { readonly balance: number; readonly lastActivityAt: string } | null,
  now: Date,
  cfg: Pick<BillingConfig, "expiry" | "chat">,
): boolean =>
  account !== null &&
  expiryState(new Date(account.lastActivityAt), account.balance, now, cfg) !==
    "ok";
