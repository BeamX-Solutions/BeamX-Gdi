/**
 * The daily billing job (spec 0004, `/api/cron/billing`): checks Vercel Cron's bearer
 * token, then runs the sweeps. Milestone 2 releases idle run holds and stale chat holds
 * (AC-7, AC-10); the payment, expiry and drift jobs join in milestones 3 and 4.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { BillingConfig } from "./config";

export type CronDeps = {
  /** `CRON_SECRET`, or undefined when unset (then every call is refused). */
  readonly secret: string | undefined;
  readonly releaseIdleHolds: (
    idleDays: number,
    chatStaleMinutes: number,
  ) => Promise<{ readonly idle: number; readonly chat: number }>;
  readonly config: Pick<BillingConfig, "holdIdleDays" | "chatHoldStaleMinutes">;
  readonly log: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

export type CronResponse = {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * True when `header` is exactly `Bearer <secret>`. Compares fixed length digests in
 * constant time, so neither the secret nor its length leaks through timing. Pure.
 */
export const cronAuthorized = (
  header: string | null,
  secret: string | undefined,
): boolean =>
  secret !== undefined &&
  header !== null &&
  timingSafeEqual(digest(header), digest(`Bearer ${secret}`));

/** One cron call: 401 without the token, else the counts per job. */
export const runBillingCron = async (
  deps: CronDeps,
  authorization: string | null,
): Promise<CronResponse> => {
  if (!cronAuthorized(authorization, deps.secret))
    return { status: 401, body: { code: "unauthorized" } };
  const released = await deps.releaseIdleHolds(
    deps.config.holdIdleDays,
    deps.config.chatHoldStaleMinutes,
  );
  deps.log("billing_cron", {
    idleHolds: released.idle,
    chatHolds: released.chat,
  });
  return {
    status: 200,
    body: { releasedIdle: released.idle, releasedChat: released.chat },
  };
};
