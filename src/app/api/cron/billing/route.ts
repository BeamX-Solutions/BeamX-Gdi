/**
 * Vercel Cron, once a day (spec 0004): the billing sweeps. The logic lives in
 * `billing/cron.ts`; this route only passes the `Authorization` header in.
 */
import type { NextRequest } from "next/server";
import { billingConfig } from "@/billing/config";
import { runBillingCron } from "@/billing/cron";
import { releaseIdleHolds } from "@/db/queries/credits";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";

export async function GET(request: NextRequest) {
  const result = await runBillingCron(
    {
      secret: env.CRON_SECRET,
      releaseIdleHolds,
      config: billingConfig,
      log: logEvent,
    },
    request.headers.get("authorization"),
  );
  return Response.json(result.body, { status: result.status });
}
