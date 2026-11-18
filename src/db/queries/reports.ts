import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { report, toolRun } from "../schema";
import { err, ok, type Result } from "@/lib/result";

type ReportRow = typeof report.$inferSelect;

export const STALE_AFTER_MINUTES = 10;
export const MAX_ATTEMPTS = 3;

export type ClaimError =
  | { readonly code: "not_found" }
  | { readonly code: "already_generating" }
  | { readonly code: "already_ready" }
  | { readonly code: "attempts_exhausted" };
export type WriteError = { readonly code: "stale_attempt" };

/** Compare and set: pending or failed or stale `generating` becomes `generating`. */
export const claim = async (
  userId: string,
  runId: string,
): Promise<Result<ReportRow, ClaimError>> => {
  const [claimed, current] = await db.batch([
    db.execute(sql`
      UPDATE report SET status = 'generating', attempts = attempts + 1, updated_at = now()
      WHERE run_id = ${runId}::uuid AND attempts < ${MAX_ATTEMPTS}
        AND (status IN ('pending', 'failed')
             OR (status = 'generating' AND updated_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES})))
        AND EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid)
      RETURNING id
    `),
    db
      .select({ report })
      .from(report)
      .innerJoin(
        toolRun,
        and(eq(toolRun.id, report.runId), eq(toolRun.userId, userId)),
      )
      .where(eq(report.runId, runId)),
  ]);
  const row = current[0]?.report;
  if (!row) return err({ code: "not_found" });
  if (claimed.rows.length > 0) return ok(row);
  if (row.status === "ready") return err({ code: "already_ready" });
  if (row.attempts >= MAX_ATTEMPTS) return err({ code: "attempts_exhausted" });
  return err({ code: "already_generating" });
};

/** Server only. Only the latest claim (matching `attempt`) may write the result. */
export const markReady = async (
  runId: string,
  attempt: number,
  content: unknown,
  model: string,
): Promise<Result<ReportRow, WriteError>> => {
  const rows = await db
    .update(report)
    .set({
      status: "ready",
      content,
      model,
      generatedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(report.runId, runId),
        eq(report.status, "generating"),
        eq(report.attempts, attempt),
      ),
    )
    .returning();
  const row = rows[0];
  return row ? ok(row) : err({ code: "stale_attempt" });
};
