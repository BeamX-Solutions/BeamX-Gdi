/**
 * Vercel Cron, once a day: the billing sweeps (spec 0004) and the guest purge (spec 0009,
 * AC-14), each run independently by `runDailyJobs` in `billing/cron.ts`. This route only
 * wires the jobs and passes the `Authorization` header in. The path stays
 * `/api/cron/billing`, so `vercel.json` does not change.
 */
import type { NextRequest } from "next/server";
import { billingConfig } from "@/billing/config";
import { runBillingSweeps, runDailyJobs } from "@/billing/cron";
import { releaseIdleHolds } from "@/db/queries/credits";
import { purgeUsers } from "@/db/queries/users";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";

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
        purge: () => purgeUsers(),
      },
      log: logEvent,
    },
    request.headers.get("authorization"),
  );
  return Response.json(result.body, { status: result.status });
}
