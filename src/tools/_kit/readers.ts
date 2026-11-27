import { err, ok, type Result } from "@/lib/result";
import type {
  AnswerValue,
  Answers,
  ScoreError,
  ToolModule,
  ToolReader,
} from "../_contract";
import { parseAnswer } from "./answer-schema";
import { missingAnswers, visibleAnswers } from "./flow";

/** One stored answer row, as `runs.get` returns it (`updated_at` kept as the raw string). */
export type StoredAnswer = {
  readonly questionId: string;
  readonly value: unknown;
  readonly updatedAt: string;
};

export type StoredDataInvalid = {
  readonly code: "stored_data_invalid";
  readonly questionId: string;
  readonly reason: string;
};

/**
 * Parses every stored answer with `parseAnswer` and keeps the visible ones (spec 0005,
 * runner step 2). A stored value that no longer parses, or a question id the tool does
 * not know, is `stored_data_invalid`.
 */
export const toAnswers = (
  tool: Pick<ToolReader, "questions">,
  rows: readonly Pick<StoredAnswer, "questionId" | "value">[],
): Result<Answers, StoredDataInvalid> => {
  const parsed: [string, AnswerValue][] = [];
  for (const row of rows) {
    const result = parseAnswer(tool, row.questionId, row.value);
    if (!result.ok) {
      return err({
        code: "stored_data_invalid",
        questionId: row.questionId,
        reason:
          result.error.code === "invalid_answer"
            ? result.error.reason
            : "unknown question",
      });
    }
    parsed.push([row.questionId, result.value]);
  }
  return ok(visibleAnswers(tool, Object.fromEntries(parsed)));
};

/**
 * The latest raw `updated_at`. Postgres prints timestamps of one session in one offset
 * and drops trailing zeros in the fraction, so the strings sort like the instants.
 */
const latest = (rows: readonly StoredAnswer[]): string | null =>
  rows.reduce<string | null>(
    (max, row) => (max === null || row.updatedAt > max ? row.updatedAt : max),
    null,
  );

export type ScoreRunError =
  | StoredDataInvalid
  | ScoreError
  | { readonly code: "invalid_scores"; readonly reason: string };

/** A profile fact a completed run contributes (spec 0012, AC-5). */
export type RunFact = {
  readonly key: string;
  readonly questionId: string;
  readonly value: unknown;
};

export type ScoredRun = {
  readonly scores: unknown;
  readonly answerCount: number;
  readonly lastAnswerAt: string | null;
  /** Visible answers of linked questions, mapped by `toFact`; nulls left out. */
  readonly facts: readonly RunFact[];
};

/** The profile facts in a run's visible answers (spec 0012, AC-5). Pure. */
export const runFacts = (
  tool: Pick<ToolModule, "questions">,
  answers: Answers,
): readonly RunFact[] =>
  tool.questions.flatMap((q) => {
    const answer = answers[q.id];
    if (q.fact === undefined || answer === undefined) return [];
    const value = q.fact.toFact(answer);
    return value === null || value === undefined
      ? []
      : [{ key: q.fact.key, questionId: q.id, value }];
  });

/**
 * Scores a run from its stored answer rows (spec 0005, AC-16). The count and latest
 * `updated_at` come from all stored rows (hidden ones too), as `runs.complete`
 * compares them; the scores come from the visible answers only.
 */
export const scoreRun = (
  tool: Pick<ToolModule, "questions" | "score" | "scoresSchema">,
  rows: readonly StoredAnswer[],
): Result<ScoredRun, ScoreRunError> => {
  const answers = toAnswers(tool, rows);
  if (!answers.ok) return answers;

  const missing = missingAnswers(tool, answers.value);
  if (missing.length > 0) return err({ code: "incomplete", missing });

  const scored = tool.score(answers.value);
  if (!scored.ok) return scored;

  const scores = tool.scoresSchema.safeParse(scored.value);
  if (!scores.success) {
    return err({
      code: "invalid_scores",
      reason:
        scores.error.issues[0]?.message ?? "scores do not match the schema",
    });
  }
  return ok({
    scores: scores.data,
    answerCount: rows.length,
    lastAnswerAt: latest(rows),
    facts: runFacts(tool, answers.value),
  });
};
