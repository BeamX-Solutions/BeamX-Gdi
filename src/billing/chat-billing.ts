/**
 * Paid chat and the starter grant cap (spec 0004, AC-9, AC-10, AC-11): the pure rules,
 * plus small factories over the Redis store and the credit queries, so the chat route
 * and the assistant's tools share one implementation. Every Redis call goes through the
 * shared `LimitStore`, which never throws.
 */
import type { LimitStore } from "@/lib/limits";
import { billingConfig, type BillingConfig } from "./config";
import { chatCharge, chatChargeOnStop, localDate } from "./pricing";

/** The allowance day: `YYYY-MM-DD` in `chat.dayTimeZone` (Lagos). Pure. */
const billingDay = (now: Date): string =>
  localDate(now, billingConfig.chat.dayTimeZone);

/** Redis keys (spec 0004, "Decisions made in design"). Pure. */
export const billingKeys = {
  freeChat: (userId: string, day: string) =>
    `billing:free-chat:${userId}:${day}`,
  freeNotice: (userId: string, day: string) =>
    `billing:free-notice:${userId}:${day}`,
  guestGrant: (ip: string, day: string) => `billing:guest-grant:${ip}:${day}`,
} as const;

/** The once a day notice marker outlives its day like the counters. */
const NOTICE_TTL_S = 48 * 60 * 60;

/**
 * How a metered chat turn is paid (AC-9). `used` is today's free count, or null when
 * Redis could not say: then the turn is paid (the route shows the short balance card if
 * the ceiling is not covered). `last` marks the turn that uses the last free message.
 */
export type ChatPlan =
  | { readonly kind: "free"; readonly left: number; readonly last: boolean }
  | { readonly kind: "paid" };

export const planChat = (used: number | null, allowance: number): ChatPlan => {
  if (used === null || used >= allowance) return { kind: "paid" };
  const left = allowance - used - 1;
  return { kind: "free", left, last: left === 0 };
};

/** How a paid turn ended, as the route saw it. */
export type ChatEnd =
  | { readonly kind: "completed" }
  | { readonly kind: "failed" }
  | { readonly kind: "stopped"; readonly receivedOutput: boolean };

/**
 * Credits to charge for a paid turn (AC-10): the real cost on a finished reply, nothing
 * on an AI error, and on a disconnect with resumable streams off nothing before the
 * first output, else the cost so far (at least 1). There is no chat Stop button; the
 * `stopped` end is that disconnect. A finished reply with no reported usage is charged the minimum, 1. Pure.
 */
export const chatSettleAmount = (
  end: ChatEnd,
  costUsd: number | null,
  cfg: Pick<BillingConfig, "ngnPerCredit" | "chat">,
): number => {
  switch (end.kind) {
    case "completed":
      return costUsd === null ? 1 : chatCharge(costUsd, cfg);
    case "failed":
      return 0;
    case "stopped":
      return chatChargeOnStop(costUsd, end.receivedOutput, cfg);
    default: {
      const unreachable: never = end;
      return unreachable;
    }
  }
};

/** The free allowance counters (AC-9). Never throw. */
export const freeChat = (deps: {
  readonly store: LimitStore;
  readonly now: () => Date;
}) => ({
  /** Free messages used today, or null on a Redis error. */
  used: (userId: string): Promise<number | null> =>
    deps.store.tryRead(
      "free_chat",
      billingKeys.freeChat(userId, billingDay(deps.now())),
    ),
  /** Counts one free reply, once it completed. */
  count: (userId: string): Promise<void> =>
    deps.store.count(
      "free_chat",
      billingKeys.freeChat(userId, billingDay(deps.now())),
    ),
  /** True only the first time today, so the "chat now costs" notice shows once. */
  noticeOnce: (userId: string): Promise<boolean> =>
    deps.store.setOnce(
      "free_chat",
      billingKeys.freeNotice(userId, billingDay(deps.now())),
      deps.now().toISOString(),
      NOTICE_TTL_S,
    ),
});

export type FreeChat = ReturnType<typeof freeChat>;

/**
 * Opens the credit account at the first billable action, with the starter grant (AC-11).
 * A guest from an IP that already got `guestPerIpPerDay` grants today gets an account
 * with 0 credits. The IP counter goes up only when a grant was actually written. Guests
 * with no known IP always get the grant. A signed in user goes through `claimGrants`
 * instead: the starter grant plus anything a verified account is owed (the sign up
 * grant, a Luna import), so a missed sign up hook heals here. Both are idempotent.
 */
export const accountOpener =
  (deps: {
    readonly store: LimitStore;
    readonly ensureAccount: (
      userId: string,
      starterGrant: number,
    ) => Promise<{ readonly created: boolean; readonly granted: number }>;
    readonly claimGrants: (
      userId: string,
    ) => Promise<{ readonly starter: number }>;
    readonly config: Pick<BillingConfig, "grants">;
    readonly now: () => Date;
  }) =>
  async (
    userId: string,
    isGuest: boolean,
    ip: string | null,
  ): Promise<{ readonly created: boolean; readonly granted: number }> => {
    const { starter, guestPerIpPerDay } = deps.config.grants;
    if (!isGuest) {
      const claimed = await deps.claimGrants(userId);
      return { created: claimed.starter > 0, granted: claimed.starter };
    }
    if (ip === null) return deps.ensureAccount(userId, starter);
    const key = billingKeys.guestGrant(ip, billingDay(deps.now()));
    const given = await deps.store.read("guest_grant", key);
    const opened = await deps.ensureAccount(
      userId,
      given >= guestPerIpPerDay ? 0 : starter,
    );
    if (opened.granted > 0) await deps.store.count("guest_grant", key);
    return opened;
  };

export type OpenAccount = ReturnType<typeof accountOpener>;
