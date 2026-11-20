import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../client";
import { newId } from "../id";
import { conversation, creditHold, report, toolRun } from "../schema";
import { chargeRunHoldCtes, releaseRunHoldCtes } from "./credit-holds";
import { MAX_ATTEMPTS, STALE_AFTER_MINUTES } from "./report-limits";
import { logEvent } from "@/lib/log";
import { err, ok, type Result } from "@/lib/result";

type ReportRow = typeof report.$inferSelect;

export { MAX_ATTEMPTS, STALE_AFTER_MINUTES };

/** Safe by construction: a kind and a short fixed message, never prompts or client data. */
export const reportErrorSchema = z.object({
  kind: z.enum([
    "timeout",
    "provider_overloaded",
    "invalid_output",
    "spend_cap",
    // Spec 0004: the run's credit hold was gone when the report finished.
    "no_credit_hold",
    "unknown",
  ]),
  message: z.string().max(300),
});
export type ReportError = z.infer<typeof reportErrorSchema>;

export type ClaimError =
  | { readonly code: "not_found" }
  | { readonly code: "already_generating" }
  | { readonly code: "already_ready" }
  | { readonly code: "attempts_exhausted" }
  | { readonly code: "no_credit_hold" };
export type WriteError = { readonly code: "stale_attempt" };
export type ReadyError =
  { readonly code: "stale_attempt" } | { readonly code: "no_credit_hold" };

/** Spec 0004: no report generation starts or finishes without an active run hold. */
const activeHoldExists = (runId: string) => sql`
  EXISTS (SELECT 1 FROM credit_hold WHERE run_id = ${runId}::uuid AND status = 'active' AND purpose = 'run')
`;

const NO_HOLD_ERROR: ReportError = {
  kind: "no_credit_hold",
  message: "The credits for this run are no longer held.",
};
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

/**
 * Compare and set: pending or failed or stale `generating` becomes `generating`. Refused
 * when the run has no active credit hold (spec 0004, AC-7).
 */
export const claim = async (
  userId: string,
  runId: string,
): Promise<Result<ReportRow, ClaimError>> => {
  const [claimed, current, holds] = await db.batch([
    db.execute(sql`
      UPDATE report SET status = 'generating', attempts = attempts + 1, updated_at = now()
      WHERE run_id = ${runId}::uuid AND attempts < ${MAX_ATTEMPTS}
        AND (status IN ('pending', 'failed')
             OR (status = 'generating' AND updated_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES})))
        AND EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid)
        AND ${activeHoldExists(runId)}
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
    db
      .select({ id: creditHold.id })
      .from(creditHold)
      .where(
        and(
          eq(creditHold.runId, runId),
          eq(creditHold.status, "active"),
          eq(creditHold.purpose, "run"),
        ),
      ),
  ]);
  const row = current[0]?.report;
  if (!row) return err({ code: "not_found" });
  if (claimed.rows.length > 0) return ok(row);
  if (row.status === "ready") return err({ code: "already_ready" });
  if (row.attempts >= MAX_ATTEMPTS) return err({ code: "attempts_exhausted" });
  if (holds.length === 0) return err({ code: "no_credit_hold" });
  return err({ code: "already_generating" });
};

/**
 * Server only. Only the latest claim (matching `attempt`) may write the result, and the
 * report turning ready charges the run's hold in the same statement (spec 0004, AC-4): a
 * stale attempt matches no row at the first step, so nothing below it runs. If the hold
 * is gone, the attempt is marked failed instead, so a report is never ready for free.
 * Throws (`billing_assert` code `charge_missing`) only if ready would land without its
 * charge, an invariant break that rolls the batch back rather than give a free report.
 */
export const markReady = async (
  runId: string,
  attempt: number,
  content: unknown,
  model: string,
): Promise<Result<ReportRow, ReadyError>> => {
  const [ready, noHold, current] = await db.batch([
    // `h` locks the hold row before the report moves. A plain EXISTS reads the statement
    // snapshot, so a release committing just before `ch` takes its lock would leave the
    // report ready and uncharged; FOR UPDATE waits and rechecks the live row instead.
    // The final assert is the backstop: every ready report charged exactly one hold and
    // wrote its ledger entry, or the whole batch rolls back.
    db.execute(sql`
      WITH h AS (
        SELECT id FROM credit_hold
        WHERE run_id = ${runId}::uuid AND status = 'active' AND purpose = 'run'
        FOR UPDATE
      ), r AS (
        UPDATE report
        SET status = 'ready', content = ${JSON.stringify(content)}::jsonb, model = ${model},
            error = NULL, generated_at = now(), updated_at = now()
        WHERE run_id = ${runId}::uuid AND status = 'generating' AND attempts = ${attempt}
          AND EXISTS (SELECT 1 FROM h)
        RETURNING run_id
      ), ${chargeRunHoldCtes(sql`SELECT run_id FROM r`, newId())}
      SELECT r.run_id FROM r
      CROSS JOIN LATERAL (
        SELECT billing_assert(
          (SELECT count(*) FROM ch) = 1 AND (SELECT count(*) FROM cl) = 1,
          'charge_missing'
        )
      ) AS charged
    `),
    db.execute(sql`
      UPDATE report
      SET status = 'failed', error = ${JSON.stringify(NO_HOLD_ERROR)}::jsonb, updated_at = now()
      WHERE run_id = ${runId}::uuid AND status = 'generating' AND attempts = ${attempt}
        AND NOT ${activeHoldExists(runId)}
      RETURNING run_id
    `),
    db.select().from(report).where(eq(report.runId, runId)),
  ]);
  const row = current[0];
  if (ready.rows.length > 0 && row) {
    logEvent("credit_run_charged", { runId, attempt });
    return ok(row);
  }
  if (noHold.rows.length > 0) {
    logEvent("report_no_credit_hold", { runId, attempt });
    return err({ code: "no_credit_hold" });
  }
  return err({ code: "stale_attempt" });
};

/** Stored when the caller's error does not fit `reportErrorSchema`. */
const FALLBACK_ERROR: ReportError = {
  kind: "unknown",
  message: "Report generation failed.",
};

/**
 * Server only. Same guard as `markReady`. Runs on the failure path, so it never throws
 * on a bad error shape: it stores a fixed `unknown` error instead, so the report still
 * leaves `generating` and the retry stays available. The last allowed attempt failing
 * releases the run's credit hold in the same statement (spec 0004, AC-5).
 */
export const markFailed = async (
  runId: string,
  attempt: number,
  error: ReportError,
): Promise<Result<ReportRow, WriteError>> => {
  const parsed = reportErrorSchema.safeParse(error);
  if (!parsed.success) logEvent("report_error_invalid", { runId, attempt });
  const safe = parsed.success ? parsed.data : FALLBACK_ERROR;
  const [failed, current] = await db.batch([
    db.execute(sql`
      WITH r AS (
        UPDATE report SET status = 'failed', error = ${JSON.stringify(safe)}::jsonb, updated_at = now()
        WHERE run_id = ${runId}::uuid AND status = 'generating' AND attempts = ${attempt}
        RETURNING run_id, attempts
      ), ${releaseRunHoldCtes(
        sql`SELECT run_id FROM r WHERE attempts >= ${MAX_ATTEMPTS}`,
        "report_failed",
      )}
      SELECT run_id, (SELECT count(*)::int FROM rh) AS released FROM r
    `),
    db.select().from(report).where(eq(report.runId, runId)),
  ]);
  const row = current[0];
  const hit = failed.rows[0] as { released: number } | undefined;
  if (!hit || !row) return err({ code: "stale_attempt" });
  if (Number(hit.released) > 0)
    logEvent("credit_hold_released", { runId, reason: "report_failed" });
  return ok(row);
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

/**
 * Server only (the report runner, spec 0005). Merges one finished phase output into
 * `report.content` under `key`, fenced by `attempt`. Bumping `updated_at` keeps a long
 * run from looking stale. Zero rows means a newer attempt owns the report.
 */
export const savePhase = async (
  runId: string,
  attempt: number,
  key: string,
  output: unknown,
): Promise<Result<void, WriteError>> => {
  const rows = await db.execute(sql`
    UPDATE report
    SET content = coalesce(content, '{}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(output)}::jsonb),
        updated_at = now()
    WHERE run_id = ${runId}::uuid AND status = 'generating' AND attempts = ${attempt}
    RETURNING run_id
  `);
  return rows.rows.length > 0 ? ok(undefined) : err({ code: "stale_attempt" });
};

const statusRowSchema = z.object({
  tool_id: z.string(),
  tool_version: z.string(),
  status: z.enum(["pending", "generating", "ready", "failed"]),
  attempts: z.number().int(),
  updated_at: z.string(),
  error: z.unknown(),
  phase_keys: z.array(z.string()),
  has_hold: z.boolean(),
  stale: z.boolean(),
});

/** The light per poll read of a report (spec 0005): never the content itself. */
export type ReportStatus = {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly status: "pending" | "generating" | "ready" | "failed";
  readonly attempts: number;
  /** Raw timestamp string, as stored. */
  readonly updatedAt: string;
  readonly error: ReportError | null;
  /** The phase keys saved in `content`, sorted. */
  readonly phaseKeys: readonly string[];
  /** The run still has an active credit hold. */
  readonly hasHold: boolean;
  /** `generating` and not updated for `STALE_AFTER_MINUTES` (judged by the DB clock). */
  readonly stale: boolean;
};

export type StatusError = { readonly code: "not_found" };

/**
 * One statement, owner scoped through `tool_run.user_id`. `not_found` for another
 * user's run, an unknown run, or a run with no report row yet.
 */
export const status = async (
  userId: string,
  runId: string,
): Promise<Result<ReportStatus, StatusError>> => {
  const rows = await db.execute(sql`
    SELECT t.tool_id, t.tool_version, r.status, r.attempts, r.updated_at::text AS updated_at,
      r.error,
      CASE WHEN jsonb_typeof(r.content) = 'object'
        THEN coalesce((SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(r.content) AS k), '[]'::jsonb)
        ELSE '[]'::jsonb END AS phase_keys,
      ${activeHoldExists(runId)} AS has_hold,
      (r.status = 'generating'
        AND r.updated_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES})) AS stale
    FROM tool_run t
    JOIN report r ON r.run_id = t.id
    WHERE t.id = ${runId}::uuid AND t.user_id = ${userId}::uuid
  `);
  const first = rows.rows[0];
  if (!first) return err({ code: "not_found" });
  const row = statusRowSchema.parse(first);
  const storedError =
    row.error === null ? null : reportErrorSchema.safeParse(row.error);
  return ok({
    toolId: row.tool_id,
    toolVersion: row.tool_version,
    status: row.status,
    attempts: row.attempts,
    updatedAt: row.updated_at,
    error:
      storedError === null
        ? null
        : storedError.success
          ? storedError.data
          : FALLBACK_ERROR,
    phaseKeys: row.phase_keys,
    hasHold: row.has_hold,
    stale: row.stale,
  });
};

const STALE_TIMEOUT_ERROR: ReportError = {
  kind: "timeout",
  message: "The last attempt stopped responding.",
};

/**
 * A stale `generating` report on its last attempt can never be reclaimed, so it is
 * failed with kind `timeout` and its hold released, in one statement (spec 0005,
 * AC-15). Changes nothing unless the run is the user's, `generating`, at
 * `MAX_ATTEMPTS`, and stale.
 */
export const failStale = async (
  userId: string,
  runId: string,
): Promise<{ readonly failed: boolean }> => {
  const rows = await db.execute(sql`
    WITH r AS (
      UPDATE report SET status = 'failed', error = ${JSON.stringify(STALE_TIMEOUT_ERROR)}::jsonb, updated_at = now()
      WHERE run_id = ${runId}::uuid AND status = 'generating' AND attempts >= ${MAX_ATTEMPTS}
        AND updated_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES})
        AND EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid)
      RETURNING run_id
    ), ${releaseRunHoldCtes(sql`SELECT run_id FROM r`, "report_failed")}
    SELECT run_id, (SELECT count(*)::int FROM rh) AS released FROM r
  `);
  const hit = rows.rows[0] as { released: number } | undefined;
  if (!hit) return { failed: false };
  logEvent("report_failed", { runId, kind: "timeout", stale: true });
  if (Number(hit.released) > 0)
    logEvent("credit_hold_released", { runId, reason: "report_failed" });
  return { failed: true };
};
