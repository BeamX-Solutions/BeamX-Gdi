/**
 * The daily jobs behind `/api/cron/billing` (spec 0004, spec 0009): checks Vercel Cron's
 * bearer token once, then runs each job independently. The billing sweeps release idle
 * run holds and stale chat holds (AC-7, AC-10); the expiry job (AC-15) and the drift
 * check (AC-20) run beside them as their own jobs, and the payment sweep joins in
 * milestone 3. The guest purge (spec 0009, AC-14) is passed in as a job, so
 * this module never reaches into users.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { BillingConfig } from "./config";

export type CronLog = (
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null>>,
) => void;

export type BillingSweepDeps = {
  readonly releaseIdleHolds: (
    idleDays: number,
    chatStaleMinutes: number,
  ) => Promise<{ readonly idle: number; readonly chat: number }>;
  readonly config: Pick<BillingConfig, "holdIdleDays" | "chatHoldStaleMinutes">;
  readonly log: CronLog;
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

/** The billing sweeps: idle run holds and stale chat holds (AC-7, AC-10). */
export const runBillingSweeps = async (
  deps: BillingSweepDeps,
): Promise<{
  readonly releasedIdle: number;
  readonly releasedChat: number;
}> => {
  const released = await deps.releaseIdleHolds(
    deps.config.holdIdleDays,
    deps.config.chatHoldStaleMinutes,
  );
  deps.log("billing_cron", {
    idleHolds: released.idle,
    chatHolds: released.chat,
  });
  return { releasedIdle: released.idle, releasedChat: released.chat };
};

/**
 * The expiry job (AC-15). While `expiry.enforce` is off (until the slice 5 email reminder)
 * it only counts and logs what would expire; nothing is taken.
 */
export const runExpiry = async (deps: {
  readonly expireInactive: (
    months: number,
    timeZone: string,
    enforce: boolean,
  ) => Promise<{
    readonly due: number;
    readonly expired: number;
    readonly credits: number;
  }>;
  readonly config: Pick<BillingConfig, "expiry" | "chat">;
  readonly log: CronLog;
}): Promise<{
  readonly enforced: boolean;
  readonly due: number;
  readonly expired: number;
  readonly credits: number;
}> => {
  const { inactiveMonths, enforce } = deps.config.expiry;
  const result = await deps.expireInactive(
    inactiveMonths,
    deps.config.chat.dayTimeZone,
    enforce,
  );
  deps.log("credit_expiry", { enforced: enforce, ...result });
  return { enforced: enforce, ...result };
};

/**
 * The drift check (AC-20): logs one `credit_drift` line per user whose ledger sum is not
 * their balance, or whose `held` is not their active holds. Never repairs.
 */
export const runDriftCheck = async (deps: {
  readonly findDrift: () => Promise<
    readonly {
      readonly userId: string;
      readonly balance: number;
      readonly ledgerSum: number;
      readonly held: number;
      readonly activeHeld: number;
    }[]
  >;
  readonly log: CronLog;
}): Promise<{ readonly drifted: number }> => {
  const drift = await deps.findDrift();
  for (const d of drift) deps.log("credit_drift", { ...d });
  return { drifted: drift.length };
};

/** The daily jobs by name; each returns its counts or throws. */
export type DailyJobs = Readonly<
  Record<string, () => Promise<Readonly<Record<string, unknown>>>>
>;

/**
 * One cron call (spec 0009, "API surface"): 401 without the token; otherwise every job
 * runs, independently, and the answer is always 200 with each job's counts, or
 * `{ error }` for a job that threw (also logged), so one failing job never stops another.
 */
export const runDailyJobs = async (
  deps: {
    readonly secret: string | undefined;
    readonly jobs: DailyJobs;
    readonly log: CronLog;
  },
  authorization: string | null,
): Promise<CronResponse> => {
  if (!cronAuthorized(authorization, deps.secret))
    return { status: 401, body: { code: "unauthorized" } };
  const results = await Promise.all(
    Object.entries(deps.jobs).map(async ([name, job]) => {
      try {
        return [name, await job()] as const;
      } catch (e) {
        const error = e instanceof Error ? e.name : "unknown";
        deps.log("daily_job_failed", { job: name, error });
        return [name, { error }] as const;
      }
    }),
  );
  return { status: 200, body: Object.fromEntries(results) };
};
