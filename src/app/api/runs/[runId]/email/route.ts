/**
 * Emails a ready report as a PDF to the account's address (spec 0015, AC-5, AC-7).
 * Accounts only: a guest gets `401 sign_in_required`. At most 5 an hour (`429`). The
 * logic lives in `assistant/report-share`.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { emailReport } from "@/assistant/report-share";
import { emailDeps } from "@/assistant/report-share-deps";
import { sessionAccount } from "@/auth/session";

export const maxDuration = 60;

const runIdSchema = z.uuid();

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/runs/[runId]/email">,
) {
  const { runId } = await ctx.params;
  const parsed = runIdSchema.safeParse(runId);
  if (!parsed.success) return json(400, { code: "invalid_run_id" });
  const account = await sessionAccount(request.headers);
  if (account === null) return json(401, { code: "unauthenticated" });
  const r = await emailReport(emailDeps, account, parsed.data);
  return json(r.status, r.body);
}
