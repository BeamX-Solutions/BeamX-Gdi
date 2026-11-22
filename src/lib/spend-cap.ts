/**
 * Server only. The daily AI spend cap (spec 0008).
 *
 * - `withSpend` wraps `usage.record`: once a call's `ai_usage` row is saved, its cost is
 *   added to `spend:<lagosDate>` (AC-1). The first total at or over the cap sets
 *   `spend:tripped:<lagosDate>` and logs `spend_cap_tripped` once (AC-3).
 * - `guestSpendCap` is the check at chat and at Approve: a guest pauses once the day's
 *   total reaches `AI_DAILY_SPEND_CAP_USD` (AC-2). Signed in users are never checked.
 * - `checkSpendCap` is the report runner's hook (spec 0005). It always allows now, so a
 *   report already claimed never fails because of the cap (AC-11).
 */
import { logEvent } from "./log";
import { err, ok, type Result } from "./result";
import {
  lagosDate,
  limitKeys,
  limits,
  limitStore,
  TRIPPED_TTL_S,
  type LimitStore,
} from "./limits";

export type SpendCapError = { readonly code: "spend_cap" };

/** The report runner's hook: never blocks a claimed report (AC-11). */
export const checkSpendCap = async (
  userId: string,
): Promise<Result<void, SpendCapError>> => {
  void userId;
  return ok(undefined);
};

export type SpendDeps = {
  readonly store: LimitStore;
  readonly capUsd: number;
  readonly now: () => Date;
  readonly log: typeof logEvent;
};

export const spendGuard = (deps: SpendDeps) => {
  /** Adds one call's dollars to today's total; trips the marker on crossing. */
  const addSpend = async (costUsd: number): Promise<void> => {
    if (!(costUsd > 0)) return;
    const day = lagosDate(deps.now());
    const total = await deps.store.addFloat(
      "spend",
      limitKeys.spend(day),
      costUsd,
    );
    if (total === null || total < deps.capUsd) return;
    const first = await deps.store.setOnce(
      "spend",
      limitKeys.spendTripped(day),
      deps.now().toISOString(),
      TRIPPED_TTL_S,
    );
    if (first)
      deps.log("spend_cap_tripped", {
        day,
        totalUsd: total,
        capUsd: deps.capUsd,
      });
  };

  /** Refuses a guest once today's total reaches the cap. Allows on a Redis error. */
  const guestSpendCap = async (): Promise<Result<void, SpendCapError>> => {
    const total = await deps.store.read(
      "spend",
      limitKeys.spend(lagosDate(deps.now())),
    );
    return total >= deps.capUsd ? err({ code: "spend_cap" }) : ok(undefined);
  };

  /**
   * `record` that also adds the call's cost to today's total, only when the row was
   * saved (a duplicate `callKey` adds nothing). Spend errors never reach the caller.
   */
  const withSpend =
    <
      I extends { readonly costUsd: number | string },
      R extends { readonly status: string },
    >(
      record: (input: I) => Promise<R>,
    ) =>
    async (input: I): Promise<R> => {
      const result = await record(input);
      if (result.status === "recorded") await addSpend(Number(input.costUsd));
      return result;
    };

  return { addSpend, guestSpendCap, withSpend };
};

const live = spendGuard({
  store: limitStore,
  capUsd: limits.spendCapUsd,
  now: () => new Date(),
  log: logEvent,
});

export const addSpend = live.addSpend;
export const guestSpendCap = live.guestSpendCap;
export const withSpend = live.withSpend;
