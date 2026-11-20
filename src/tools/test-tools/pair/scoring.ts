/** Test only (spec 0005). One scoring engine for both pair modules. */
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import type { Answers, ScoreError } from "@/tools/_contract";
import { missingAnswers } from "@/tools/_kit/flow";
import { pairQuestions } from "./questions";

export const pairScoresSchema = z.object({
  total: z.number().int(),
  max: z.number().int(),
});
export type PairScores = z.infer<typeof pairScoresSchema>;

export const scorePair = (answers: Answers): Result<PairScores, ScoreError> => {
  const missing = missingAnswers({ questions: pairQuestions }, answers);
  if (missing.length > 0) return err({ code: "incomplete", missing });
  const total = pairQuestions.reduce(
    (sum, q) =>
      sum + (typeof answers[q.id] === "number" ? Number(answers[q.id]) : 0),
    0,
  );
  return ok({ total, max: pairQuestions.length * 5 });
};
