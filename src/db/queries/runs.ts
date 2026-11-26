import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { isUniqueViolation } from "../errors";
import { newId } from "../id";
import { report, toolRun, toolRunAnswer, user } from "../schema";
import { releaseRunHolds } from "./credit-holds";
import { runFactsStatement, type RunFactEntry } from "./profile";
import { err, ok, type Result } from "@/lib/result";

type RunRow = typeof toolRun.$inferSelect;
type AnswerRow = typeof toolRunAnswer.$inferSelect;
type AnswerSource = (typeof toolRunAnswer.$inferInsert)["source"];

const ACTIVE_INDEX = "tool_run_one_active_per_conversation";

export type StartError =
  { readonly code: "not_found" } | { readonly code: "run_in_progress" };
export type PauseError =
  { readonly code: "not_found" } | { readonly code: "not_in_progress" };
export type ResumeError =
  | { readonly code: "not_found" }
  | { readonly code: "not_paused" }
  | { readonly code: "run_in_progress" };
export type StartFromError =
  | { readonly code: "not_found" }
  | { readonly code: "previous_not_completed" }
  | { readonly code: "no_conversation" }
  | { readonly code: "version_changed" }
  | { readonly code: "run_in_progress" };
export type SaveAnswerError = {
  readonly code: "not_found_or_not_in_progress";
};
export type CompleteError =
  | { readonly code: "not_found" }
  | { readonly code: "not_in_progress" }
  | { readonly code: "answers_changed" };
export type AbandonError =
  { readonly code: "not_found" } | { readonly code: "already_completed" };
export type GetRunError = { readonly code: "not_found" };

/**
 * Two parallel writers can both see "no active run" and race to the partial unique
 * index (AC-3). The loser retries once (it then pauses the winner), then gives up.
 */
export const withActiveRetry = async <T>(
  run: () => Promise<T>,
): Promise<
  { readonly conflict: false; readonly value: T } | { readonly conflict: true }
> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { conflict: false, value: await run() };
    } catch (e) {
      if (!isUniqueViolation(e, ACTIVE_INDEX)) throw e;
    }
  }
  return { conflict: true };
};

/** The owner scoped read of one run, used to end every run batch. */
export const selectRun = (userId: string, runId: string) =>
  db
    .select()
    .from(toolRun)
    .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId)));

/**
 * The write statements of `start` (pause the chat's active run, insert the new one).
 * Exported so `credits.startRunWithHold` can add the hold to the same batch.
 */
export const startStatements = (
  userId: string,
  conversationId: string,
  runId: string,
  toolId: string,
  toolVersion: string,
) =>
  [
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
  ] as const;

/** Pauses the active run in the chat and starts a new one, atomically (one batch). */
export const start = async (
  userId: string,
  conversationId: string,
  toolId: string,
  toolVersion: string,
): Promise<Result<{ run: RunRow; pausedRunId: string | null }, StartError>> => {
  const runId = newId();
  const outcome = await withActiveRetry(async () => {
    const [paused, , created] = await db.batch([
      ...startStatements(userId, conversationId, runId, toolId, toolVersion),
      selectRun(userId, runId),
    ]);
    return { run: created[0], pausedRunId: paused[0]?.id ?? null };
  });
  if (outcome.conflict) return err({ code: "run_in_progress" });
  if (!outcome.value.run) return err({ code: "not_found" });
  return ok({ run: outcome.value.run, pausedRunId: outcome.value.pausedRunId });
};

export const pause = async (
  userId: string,
  runId: string,
): Promise<Result<RunRow, PauseError>> => {
  const [, current] = await db.batch([
    db
      .update(toolRun)
      .set({ status: "paused" })
      .where(
        and(
          eq(toolRun.id, runId),
          eq(toolRun.userId, userId),
          eq(toolRun.status, "in_progress"),
        ),
      ),
    db
      .select()
      .from(toolRun)
      .where(and(eq(toolRun.id, runId), eq(toolRun.userId, userId))),
  ]);
  const run = current[0];
  if (!run) return err({ code: "not_found" });
  if (run.status === "paused") return ok(run);
  return err({ code: "not_in_progress" });
};

/**
 * The write statements of `resume` (pause whatever else is active in the chat, resume
 * the target). Exported so `credits.resumeRunWithHold` can add the hold to the batch.
 */
export const resumeStatements = (userId: string, runId: string) =>
  [
    db.execute(sql`
      UPDATE tool_run o SET status = 'paused', updated_at = now()
      FROM tool_run t
      WHERE t.id = ${runId}::uuid AND t.user_id = ${userId}::uuid AND t.status = 'paused'
        AND o.conversation_id = t.conversation_id AND o.user_id = ${userId}::uuid
        AND o.status = 'in_progress' AND o.id <> t.id
      RETURNING o.id
    `),
    db
      .update(toolRun)
      .set({ status: "in_progress" })
      .where(
        and(
          eq(toolRun.id, runId),
          eq(toolRun.userId, userId),
          eq(toolRun.status, "paused"),
        ),
      ),
  ] as const;

/** Pauses whatever is active in the same chat, then resumes the target, in one batch. */
export const resume = async (
  userId: string,
  runId: string,
): Promise<
  Result<{ run: RunRow; pausedRunId: string | null }, ResumeError>
> => {
  const outcome = await withActiveRetry(async () => {
    const [paused, , current] = await db.batch([
      ...resumeStatements(userId, runId),
      selectRun(userId, runId),
    ]);
    const first = paused.rows[0] as { id: string } | undefined;
    return { run: current[0], pausedRunId: first?.id ?? null };
  });
  if (outcome.conflict) return err({ code: "run_in_progress" });
  if (!outcome.value.run) return err({ code: "not_found" });
  if (outcome.value.run.status !== "in_progress")
    return err({ code: "not_paused" });
  return ok({ run: outcome.value.run, pausedRunId: outcome.value.pausedRunId });
};

/**
 * "Change my answers": a new run in the same chat prefilled with copies of a completed
 * run's answers. The old run and its report stay untouched (AC-4).
 */
/** A completed run `startFrom` may copy: its chat and its answers. */
export type StartFromSource = {
  readonly conversationId: string;
  readonly answers: readonly AnswerRow[];
};

/**
 * Reads and checks the run `startFrom` copies (completed, in a chat, same tool version).
 * Exported so `credits.startFromWithHold` checks it the same way.
 */
export const startFromSource = async (
  userId: string,
  previousRunId: string,
  toolVersion: string,
): Promise<Result<StartFromSource, StartFromError>> => {
  const prev = await get(userId, previousRunId);
  if (!prev.ok) return err({ code: "not_found" });
  const { run: old, answers } = prev.value;
  if (old.status !== "completed")
    return err({ code: "previous_not_completed" });
  if (old.conversationId === null) return err({ code: "no_conversation" });
  if (old.toolVersion !== toolVersion) return err({ code: "version_changed" });
  return ok({ conversationId: old.conversationId, answers });
};

/**
 * The write statements of `startFrom` (pause the chat's active run, insert the new run,
 * copy the answers with their sources), in batch order. Exported so
 * `credits.startFromWithHold` can add the hold to the same batch.
 */
export const startFromStatements = (
  userId: string,
  previousRunId: string,
  runId: string,
  source: StartFromSource,
) => {
  const copy =
    source.answers.length === 0
      ? db.execute(sql`SELECT 1`)
      : db.execute(sql`
          INSERT INTO tool_run_answer (id, run_id, question_id, value, source)
          SELECT v.id, ${runId}::uuid, v.question_id, v.value, v.source
          FROM (VALUES ${sql.join(
            source.answers.map(
              (a) =>
                sql`(${newId()}::uuid, ${a.questionId}, ${JSON.stringify(a.value)}::jsonb, ${a.source}::answer_source)`,
            ),
            sql`, `,
          )}) AS v(id, question_id, value, source)
          WHERE EXISTS (SELECT 1 FROM tool_run WHERE id = ${runId}::uuid)
        `);
  return [
    db
      .update(toolRun)
      .set({ status: "paused" })
      .where(
        and(
          eq(toolRun.conversationId, source.conversationId),
          eq(toolRun.userId, userId),
          eq(toolRun.status, "in_progress"),
        ),
      )
      .returning({ id: toolRun.id }),
    db.execute(sql`
      INSERT INTO tool_run (id, user_id, conversation_id, tool_id, tool_version, based_on_run_id)
      SELECT ${runId}::uuid, user_id, conversation_id, tool_id, tool_version, id
      FROM tool_run
      WHERE id = ${previousRunId}::uuid AND user_id = ${userId}::uuid
        AND status = 'completed' AND conversation_id IS NOT NULL
    `),
    copy,
  ] as const;
};

export const startFrom = async (
  userId: string,
  previousRunId: string,
  toolVersion: string,
): Promise<
  Result<{ run: RunRow; pausedRunId: string | null }, StartFromError>
> => {
  const source = await startFromSource(userId, previousRunId, toolVersion);
  if (!source.ok) return source;
  const runId = newId();
  const outcome = await withActiveRetry(async () => {
    const [paused, , , created] = await db.batch([
      ...startFromStatements(userId, previousRunId, runId, source.value),
      selectRun(userId, runId),
    ]);
    return { run: created[0], pausedRunId: paused[0]?.id ?? null };
  });
  if (outcome.conflict) return err({ code: "run_in_progress" });
  if (!outcome.value.run) return err({ code: "not_found" });
  return ok({ run: outcome.value.run, pausedRunId: outcome.value.pausedRunId });
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
  facts: readonly RunFactEntry[] = [],
): Promise<Result<RunRow, CompleteError>> => {
  const [, , , , runRows] = await db.batch([
    // Lock first: a concurrent saveAnswer holds FOR SHARE. The fingerprint check below
    // must run in a snapshot taken after that answer committed, which a plain UPDATE
    // that merely waits on the row lock would not do (its subquery keeps the old snapshot).
    db.execute(sql`
      SELECT id FROM tool_run
      WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'in_progress'
      FOR UPDATE
    `),
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
    // Spec 0012, AC-5: the run's facts join the profile, only if it completed.
    runFactsStatement(userId, runId, facts),
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

export const abandon = async (
  userId: string,
  runId: string,
): Promise<Result<RunRow, AbandonError>> => {
  const [, , current] = await db.batch([
    db
      .update(toolRun)
      .set({ status: "abandoned" })
      .where(
        and(
          eq(toolRun.id, runId),
          eq(toolRun.userId, userId),
          sql`${toolRun.status} IN ('in_progress', 'paused')`,
        ),
      ),
    // Spec 0004, AC-5: an abandoned run's credit hold is released in the same batch.
    releaseRunHolds(
      sql`SELECT id FROM tool_run WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid AND status = 'abandoned'`,
      "abandoned",
    ),
    selectRun(userId, runId),
  ]);
  const run = current[0];
  if (!run) return err({ code: "not_found" });
  if (run.status === "completed") return err({ code: "already_completed" });
  return ok(run);
};

export const get = async (
  userId: string,
  runId: string,
): Promise<
  Result<
    {
      run: RunRow;
      answers: AnswerRow[];
      report: typeof report.$inferSelect | null;
    },
    GetRunError
  >
> => {
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
      .where(eq(toolRunAnswer.runId, runId))
      .orderBy(asc(toolRunAnswer.createdAt), asc(toolRunAnswer.id)),
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
  if (!run) return err({ code: "not_found" });
  return ok({
    run,
    answers: answers.map((a) => a.answer),
    report: reports[0]?.report ?? null,
  });
};

/** The run owner at write time, with the first name report prompts may use. */
export type RunOwner = {
  readonly userId: string;
  /** Null for a guest or a blank name. */
  readonly firstName: string | null;
};

/** The longest first name a prompt carries (spec 0010). */
export const FIRST_NAME_MAX = 50;

/**
 * The account name trimmed and cut to 50 characters, for account holders only; null
 * for a guest or a blank name (spec 0010, contract addition 4). Pure.
 */
export const toFirstName = (
  name: string | null,
  isAnonymous: boolean | null,
): string | null => {
  if (isAnonymous === true) return null;
  const cut = (name ?? "").trim().slice(0, FIRST_NAME_MAX).trim();
  return cut.length > 0 ? cut : null;
};

/**
 * Server only (the report step). Reads the run's current owner at write time, the run
 * twin of `conversations.ownerOf` (spec 0002, "Writes after a link"), with the
 * owner's first name, in one statement.
 */
export const ownerOf = async (
  runId: string,
): Promise<Result<RunOwner, GetRunError>> => {
  const rows = await db
    .select({
      userId: toolRun.userId,
      name: user.name,
      isAnonymous: user.isAnonymous,
    })
    .from(toolRun)
    .innerJoin(user, eq(user.id, toolRun.userId))
    .where(eq(toolRun.id, runId));
  const row = rows[0];
  return row
    ? ok({
        userId: row.userId,
        firstName: toFirstName(row.name, row.isAnonymous),
      })
    : err({ code: "not_found" });
};

/** The chat's active run with its answers (or null), plus its paused runs. */
/**
 * The two selects of `getActive` (the chat's live runs, the active run's answers), so
 * `conversations.turnContext` can add them to its own batch. Pair with `toActive`.
 */
export const activeStatements = (userId: string, conversationId: string) =>
  [
    db
      .select()
      .from(toolRun)
      .where(
        and(
          eq(toolRun.conversationId, conversationId),
          eq(toolRun.userId, userId),
          sql`${toolRun.status} IN ('in_progress', 'paused')`,
        ),
      )
      .orderBy(asc(toolRun.createdAt), asc(toolRun.id)),
    db
      .select({ answer: toolRunAnswer })
      .from(toolRunAnswer)
      .innerJoin(
        toolRun,
        and(
          eq(toolRun.id, toolRunAnswer.runId),
          eq(toolRun.conversationId, conversationId),
          eq(toolRun.userId, userId),
          eq(toolRun.status, "in_progress"),
        ),
      )
      .orderBy(asc(toolRunAnswer.createdAt), asc(toolRunAnswer.id)),
  ] as const;

/** The active run with its answers, plus the paused runs, from `activeStatements` rows. */
export const toActive = (
  live: readonly RunRow[],
  answers: readonly { readonly answer: AnswerRow }[],
) => {
  const active = live.find((r) => r.status === "in_progress");
  return {
    active: active
      ? { run: active, answers: answers.map((a) => a.answer) }
      : null,
    paused: live.filter((r) => r.status === "paused"),
  };
};

export const getActive = async (userId: string, conversationId: string) => {
  const [live, answers] = await db.batch(
    activeStatements(userId, conversationId),
  );
  return toActive(live, answers);
};
