/**
 * What the money tools share (spec 0006, "Approval mechanics"): the fail closed read
 * behind every server written field, the approval rule, and the hold error mapping.
 *
 * A refinement writes `shownPrice` or `heldAmount` only from a successful read. The
 * approval rule asks only when that field is present, so a card with no price never
 * shows, and `execute` never spends without it.
 */
import { z } from "zod";
import type { HoldError, RunQuote } from "@/db/queries/credits";
import { billingConfig } from "@/billing/config";
import { shortfall } from "@/billing/pricing";
import type { CreditSummary } from "@/billing/summary";
import type { ToolModule } from "@/tools/registry";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";

export type QuoteRead =
  | { readonly ok: true; readonly quote: RunQuote }
  | { readonly ok: false; readonly error: "not_found" | "try_again" };

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/**
 * A run of this chat and its active hold. Never throws: a failed read is `try_again`,
 * and a run that isn't the owner's, or belongs to another chat, is `not_found`. A
 * `not_found` reads the owner again and retries once (a guest link mid turn).
 */
export const quoteRun = async (
  env: ToolEnv,
  runId: string,
): Promise<QuoteRead> => {
  if (!isUuid(runId)) return { ok: false, error: "not_found" };
  try {
    const { owner, result } = await asOwner(
      env.deps,
      env.conversationId,
      env.owner,
      (id) => env.deps.runQuote(id, runId),
    );
    env.owner.current = owner.current;
    if (!result.ok || result.value.conversationId !== env.conversationId)
      return { ok: false, error: "not_found" };
    return { ok: true, quote: result.value };
  } catch {
    return { ok: false, error: "try_again" };
  }
};

/** The run's tool, if it is registered and still at the run's version. */
export const currentTool = (
  env: ToolEnv,
  quote: Pick<RunQuote, "toolId" | "toolVersion">,
): ToolModule | null => {
  const found = env.deps.getTool(quote.toolId);
  return found.ok && found.value.version === quote.toolVersion
    ? found.value
    : null;
};

/** The approval rule of every money tool: ask only when the server field is present. */
export const askWhenPresent = (
  field: number | undefined,
): "user-approval" | "not-applicable" =>
  field === undefined ? "not-applicable" : "user-approval";

/** Leave this out; the server fills it in. */
export const serverField = (what: string) =>
  z
    .int()
    .nonnegative()
    .optional()
    .describe(`${what} Leave this out; the server fills it in.`);

export type HoldFailure =
  | {
      readonly ok: false;
      readonly error:
        "run_in_progress" | "not_found" | "not_paused" | "try_again";
    }
  | {
      readonly ok: false;
      readonly error: "insufficient_credits";
      readonly price: number;
      readonly available: number;
      readonly shortfall: number;
    };

/** A failed hold as the tool result the model explains. */
export const holdFailure = (error: HoldError, price: number): HoldFailure => {
  switch (error.code) {
    case "insufficient_credits":
      return {
        ok: false,
        error: "insufficient_credits",
        price,
        available: error.available,
        shortfall: shortfall(price, error.available),
      };
    case "run_in_progress":
      return { ok: false, error: "run_in_progress" };
    case "not_paused":
      return { ok: false, error: "not_paused" };
    case "already_held":
      return { ok: false, error: "try_again" };
    case "not_found":
      return { ok: false, error: "not_found" };
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
};

/**
 * The available balance on a money card (spec 0007, Credit UI): the account's available
 * credits, or the starter grant a first approval would create. Throws on a failed read,
 * so the refinement leaves the card out (fail closed). It reads the same on the card
 * and on the approval, because the account is only created in `execute`.
 */
export const cardBalance = async (env: ToolEnv): Promise<number> =>
  (await env.deps.getSummary(env.owner.current))?.available ??
  billingConfig.grants.starter;

/** What a money tool returns with the chip's numbers (spec 0007, AC-9). */
export type WithSummary<T> = T & { readonly summary?: CreditSummary };

/**
 * The output with the owner's credit summary, read after the money write. A failed read
 * or no account leaves `summary` out; the chip keeps what it showed. Never throws.
 */
export const withSummary = async <T extends object>(
  env: ToolEnv,
  output: T,
): Promise<WithSummary<T>> => {
  try {
    const summary = await env.deps.getSummary(env.owner.current);
    return summary === null ? output : { ...output, summary };
  } catch {
    return output;
  }
};

/** A guest's new run refused at Approve (spec 0008): nothing was held. */
export type RunGuardFailure = {
  readonly ok: false;
  readonly error: "spend_cap" | "run_limit";
};

/**
 * Starts a new run behind the guest guards (spec 0008, AC-2, AC-4). For a guest, before
 * any hold: the spend cap, then the atomic run counters. A refusal records the card to
 * show and returns without calling `start`. If `start` then fails (or throws), the run
 * count is given back, so only runs that actually start count. Signed in users go
 * straight to `start`.
 */
export const guardedStart = async <T extends { readonly ok: boolean }>(
  env: ToolEnv,
  start: () => Promise<T>,
): Promise<T | RunGuardFailure> => {
  if (!env.isGuest) return start();
  const { limits } = env.deps;
  const cap = await limits.guestSpendCap();
  if (!cap.ok) {
    env.record({ kind: "refused", reason: "spend_cap" });
    return { ok: false, error: "spend_cap" };
  }
  const ticket = await limits.takeRun(env.owner.current, env.ip);
  if (!ticket.ok) {
    env.record({ kind: "refused", reason: "runs_daily" });
    return { ok: false, error: "run_limit" };
  }
  try {
    const output = await start();
    if (!output.ok) await limits.giveBackRun(ticket.value);
    return output;
  } catch (e) {
    await limits.giveBackRun(ticket.value);
    throw e;
  }
};
