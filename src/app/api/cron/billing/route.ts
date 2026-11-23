/**
 * Vercel Cron, once a day: the billing sweeps, the stale payment sweep, the expiry job and
 * the drift check (spec 0004) and the guest purge (spec 0009, AC-14), each run independently by `runDailyJobs` in `billing/cron.ts`. This route only
 * wires the jobs and passes the `Authorization` header in. The path stays
 * `/api/cron/billing`, so `vercel.json` does not change.
 */
import type { NextRequest } from "next/server";
import { sweepPayments } from "@/billing/checkout";
import { billingConfig } from "@/billing/config";
import {
  runBillingSweeps,
  runDailyJobs,
  runDriftCheck,
  runExpiry,
} from "@/billing/cron";
import {
  expireInactive,
  findDrift,
  releaseIdleHolds,
} from "@/db/queries/credits";
import * as payments from "@/db/queries/payments";
import { purgeUsers } from "@/db/queries/users";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { settleDeps, verify } from "@/app/credits/payment-deps";

// The purge stops itself after 120 seconds; this leaves room for the sweeps beside it.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const result = await runDailyJobs(
    {
      secret: env.CRON_SECRET,
      jobs: {
        billing: () =>
          runBillingSweeps({
            releaseIdleHolds,
            config: billingConfig,
            log: logEvent,
          }),
        // Its own job, so a Paystack or payment problem never stops the hold sweeps.
        payments: () =>
          sweepPayments({
            ...settleDeps,
            listStalePending: payments.listStalePending,
            verify,
            markAbandoned: payments.markAbandoned,
            now: Date.now,
            budgetMs: 60_000,
            limit: 100,
          }),
        expiry: () =>
          runExpiry({ expireInactive, config: billingConfig, log: logEvent }),
        drift: () => runDriftCheck({ findDrift, log: logEvent }),
        purge: () => purgeUsers(),
      },
      log: logEvent,
    },
    request.headers.get("authorization"),
  );
  return Response.json(result.body, { status: result.status });
}
