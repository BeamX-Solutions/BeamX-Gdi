import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../client";
import { conversation, report, toolRun } from "../schema";
import { logEvent } from "@/lib/log";
import { isUuid } from "./codecs";
import { err, ok, type Result } from "@/lib/result";

type ReportRow = typeof report.$inferSelect;

export const STALE_AFTER_MINUTES = 10;
export const MAX_ATTEMPTS = 3;

/** Safe by construction: a kind and a short fixed message, never prompts or client data. */
export const reportErrorSchema = z.object({
  kind: z.enum([
    "timeout",
    "provider_overloaded",
    "invalid_output",
    "spend_cap",
    "unknown",
  ]),
  message: z.string().max(300),
});
export type ReportError = z.infer<typeof reportErrorSchema>;

export type ClaimError =
  | { readonly code: "not_found" }
  | { readonly code: "already_generating" }
  | { readonly code: "already_ready" }
  | { readonly code: "attempts_exhausted" };
export type WriteError = { readonly code: "stale_attempt" };
export type ListError = { readonly code: "not_found" };

/** Every run in a chat (all statuses), newest first, each with its report or null. */
export const runsWithReports = (userId: string, conversationId: string) =>
  db
    .select({ run: toolRun, report })
    .from(toolRun)
    .leftJoin(report, eq(report.runId, toolRun.id))
    .where(
      and(
        eq(toolRun.conversationId, conversationId),
        eq(toolRun.userId, userId),
      ),
    )
    .orderBy(desc(toolRun.createdAt), desc(toolRun.id));

/** Compare and set: pending or failed or stale `generating` becomes `generating`. */
export const claim = async (
  userId: string,
  runId: string,
): Promise<Result<ReportRow, ClaimError>> => {
  if (!isUuid(runId)) return err({ code: "not_found" });
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
      error: null,
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

/** Stored when the caller's error does not fit `reportErrorSchema`. */
const FALLBACK_ERROR: ReportError = {
  kind: "unknown",
  message: "Report generation failed.",
};

/**
 * Server only. Same guard as `markReady`. Runs on the failure path, so it never throws
 * on a bad error shape: it stores a fixed `unknown` error instead, so the report still
 * leaves `generating` and the retry stays available.
 */
export const markFailed = async (
  runId: string,
  attempt: number,
  error: ReportError,
): Promise<Result<ReportRow, WriteError>> => {
  const parsed = reportErrorSchema.safeParse(error);
  if (!parsed.success) logEvent("report_error_invalid", { runId, attempt });
  const safe = parsed.success ? parsed.data : FALLBACK_ERROR;
  const rows = await db
    .update(report)
    .set({ status: "failed", error: safe, updatedAt: sql`now()` })
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

export const listForConversation = async (
  userId: string,
  conversationId: string,
): Promise<Result<Awaited<ReturnType<typeof runsWithReports>>, ListError>> => {
  const [owned, rows] = await db.batch([
    db
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.userId, userId),
        ),
      ),
    runsWithReports(userId, conversationId),
  ]);
  return owned.length === 0 ? err({ code: "not_found" }) : ok(rows);
};
