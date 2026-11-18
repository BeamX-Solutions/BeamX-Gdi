import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { report, toolRun, toolRunAnswer } from "../schema";
import { err, ok, type Result } from "@/lib/result";

type RunRow = typeof toolRun.$inferSelect;
type AnswerSource = (typeof toolRunAnswer.$inferInsert)["source"];

export type StartError = { readonly code: "not_found" };
export type SaveAnswerError = {
  readonly code: "not_found_or_not_in_progress";
};
export type CompleteError =
  | { readonly code: "not_found" }
  | { readonly code: "not_in_progress" }
  | { readonly code: "answers_changed" };
export type GetRunError = { readonly code: "not_found" };

/** Pauses the active run in the chat and starts a new one, atomically (one batch). */
export const start = async (
  userId: string,
  conversationId: string,
  toolId: string,
  toolVersion: string,
): Promise<Result<{ run: RunRow; pausedRunId: string | null }, StartError>> => {
  const runId = newId();
  const [paused, , created] = await db.batch([
    db
      .update(toolRun)
      .set({ status: "paused" })
      .where(
        and(
          eq(toolRun.conversationId, conversationId),
          eq(toolRun.userId, userId),
          eq(toolRun.status, "in_progress"),
        ),
      )
      .returning({ id: toolRun.id }),
    db.execute(sql`
      INSERT INTO tool_run (id, user_id, conversation_id, tool_id, tool_version)
      SELECT ${runId}::uuid, c.user_id, c.id, ${toolId}, ${toolVersion}
      FROM conversation c
      WHERE c.id = ${conversationId}::uuid AND c.user_id = ${userId}::uuid
    `),
    db
      .select()
      .from(toolRun)
      .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId))),
  ]);
  const run = created[0];
  if (!run) return err({ code: "not_found" });
  return ok({ run, pausedRunId: paused[0]?.id ?? null });
};

/**
 * One statement upsert guarded by ownership and `in_progress`. FOR SHARE makes a
 * concurrent `complete` wait, so an answer never lands in a completed run.
 */
export const saveAnswer = async (
  userId: string,
  runId: string,
  questionId: string,
  value: unknown,
  source: AnswerSource,
): Promise<
  Result<{ questionId: string; source: AnswerSource }, SaveAnswerError>
> => {
  const [inserted] = await db.batch([
    db.execute(sql`
      INSERT INTO tool_run_answer (id, run_id, question_id, value, source)
      SELECT ${newId()}::uuid, r.id, ${questionId}, ${JSON.stringify(value)}::jsonb, ${source}::answer_source
      FROM tool_run r
      WHERE r.id = ${runId}::uuid AND r.user_id = ${userId}::uuid AND r.status = 'in_progress'
      FOR SHARE
      ON CONFLICT (run_id, question_id) DO UPDATE
        SET value = excluded.value, source = excluded.source, updated_at = now()
      RETURNING question_id
    `),
    db.execute(sql`
      UPDATE tool_run SET updated_at = now()
      WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'in_progress'
    `),
  ]);
  if (inserted.rows.length === 0)
    return err({ code: "not_found_or_not_in_progress" });
  return ok({ questionId, source });
};

/** Completes a run only if its answers still match what the scores were computed from. */
export const complete = async (
  userId: string,
  runId: string,
  scores: unknown,
  answerCount: number,
  lastAnswerAt: string | null,
): Promise<Result<RunRow, CompleteError>> => {
  const [, , runRows] = await db.batch([
    db.execute(sql`
      UPDATE tool_run
      SET status = 'completed', scores = ${JSON.stringify(scores)}::jsonb,
          completed_at = now(), updated_at = now()
      WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'in_progress'
        AND (SELECT ROW(count(*), max(updated_at)) FROM tool_run_answer WHERE run_id = ${runId}::uuid)
            IS NOT DISTINCT FROM ROW(${answerCount}::bigint, ${lastAnswerAt}::timestamptz)
    `),
    db.execute(sql`
      INSERT INTO report (id, run_id)
      SELECT ${newId()}::uuid, id FROM tool_run
      WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'completed'
      ON CONFLICT (run_id) DO NOTHING
    `),
    db
      .select()
      .from(toolRun)
      .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId))),
  ]);
  const run = runRows[0];
  if (!run) return err({ code: "not_found" });
  if (run.status === "completed") return ok(run);
  if (run.status === "in_progress") return err({ code: "answers_changed" });
  return err({ code: "not_in_progress" });
};

export const get = async (userId: string, runId: string) => {
  const [runs, answers, reports] = await db.batch([
    db
      .select()
      .from(toolRun)
      .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId))),
    db
      .select({ answer: toolRunAnswer })
      .from(toolRunAnswer)
      .innerJoin(
        toolRun,
        and(eq(toolRun.id, toolRunAnswer.runId), eq(toolRun.userId, userId)),
      )
      .where(eq(toolRunAnswer.runId, runId)),
    db
      .select({ report })
      .from(report)
      .innerJoin(
        toolRun,
        and(eq(toolRun.id, report.runId), eq(toolRun.userId, userId)),
      )
      .where(eq(report.runId, runId)),
  ]);
  const run = runs[0];
  if (!run) return err<GetRunError>({ code: "not_found" });
  return ok({
    run,
    answers: answers.map((a) => a.answer),
    report: reports[0]?.report ?? null,
  });
};
