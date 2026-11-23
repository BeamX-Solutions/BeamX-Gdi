/**
 * The daily jobs behind `/api/cron/billing` (spec 0004, spec 0009): checks Vercel Cron's
 * bearer token once, then runs each job independently. The billing sweeps release idle
 * run holds and stale chat holds (AC-7, AC-10); the payment, expiry and drift jobs join
 * in milestones 3 and 4. The guest purge (spec 0009, AC-14) is passed in as a job, so
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
