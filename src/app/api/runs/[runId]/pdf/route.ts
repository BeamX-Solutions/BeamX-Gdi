/**
 * The report PDF download (spec 0015, AC-1, AC-7). Only the run's owner gets the file;
 * anyone else gets `404`, and a report that isn't ready gets `409 not_ready`. The logic
 * lives in `assistant/report-share`.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { downloadPdf } from "@/assistant/report-share";
import { pdfDeps } from "@/assistant/report-share-deps";
import { sessionUserId } from "@/auth/session";

export const maxDuration = 60;

const runIdSchema = z.uuid();

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/runs/[runId]/pdf">,
) {
  const { runId } = await ctx.params;
  const parsed = runIdSchema.safeParse(runId);
  if (!parsed.success) return json(400, { code: "invalid_run_id" });
  const userId = await sessionUserId(request.headers);
  if (userId === null) return json(401, { code: "unauthenticated" });
  const r = await downloadPdf(pdfDeps, userId, parsed.data);
  if (!r.ok) return json(r.reply.status, r.reply.body);
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
