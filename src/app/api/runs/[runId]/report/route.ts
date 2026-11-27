/**
 * The report routes (spec 0005). POST starts or retries a run's report and runs its
 * phases in `after()`; GET is the status poll. Both act only on the session user's runs
 * and return typed JSON, never a thrown 500. The logic lives in `assistant/report-api`.
 */
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getReport,
  postReport,
  type ApiResponse,
} from "@/assistant/report-api";
import { reportApiDeps } from "@/assistant/report-deps";
import { sessionUserId } from "@/auth/session";

// Vercel Hobby's cap (spec 0001): every phase must fit in 300 seconds. Stellar has one
// phase. Luna's five run one phase per call, continued by the panel (spec 0013).
export const maxDuration = 300;

const runIdSchema = z.uuid();

type Resolved =
  | { readonly ok: true; readonly userId: string; readonly runId: string }
  | { readonly ok: false; readonly response: Response };

const json = (status: number, body: unknown): Response =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const send = (r: ApiResponse): Response => json(r.status, r.body);

const resolve = async (
  request: NextRequest,
  ctx: RouteContext<"/api/runs/[runId]/report">,
): Promise<Resolved> => {
  const { runId } = await ctx.params;
  const parsed = runIdSchema.safeParse(runId);
  if (!parsed.success)
    return { ok: false, response: json(400, { code: "invalid_run_id" }) };
  const userId = await sessionUserId(request.headers);
  if (userId === null)
    return { ok: false, response: json(401, { code: "unauthenticated" }) };
  return { ok: true, userId, runId: parsed.data };
};

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/runs/[runId]/report">,
) {
  const r = await resolve(request, ctx);
  if (!r.ok) return r.response;
  return send(
    await postReport(reportApiDeps, r, (task) => {
      after(task);
    }),
  );
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/runs/[runId]/report">,
) {
  const r = await resolve(request, ctx);
  if (!r.ok) return r.response;
  return send(await getReport(reportApiDeps, r));
}
