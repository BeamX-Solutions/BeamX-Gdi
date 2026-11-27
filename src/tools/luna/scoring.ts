/**
 * Luna has no scoring (spec 0013, AC-5): completeness only. Every required visible
 * question must be answered; the score is how many visible answers there are. Pure.
 */
import { err, ok, type Result } from "@/lib/result";
import type { Answers, ScoreError } from "../_contract";
import { missingAnswers, visibleAnswers } from "../_kit/flow";
import { lunaQuestions } from "./facts";
import type { LunaScores } from "./report";

export const scoreLuna = (answers: Answers): Result<LunaScores, ScoreError> => {
  const tool = { questions: lunaQuestions };
  const missing = missingAnswers(tool, answers);
  if (missing.length > 0) return err({ code: "incomplete", missing });
  return ok({ answered: Object.keys(visibleAnswers(tool, answers)).length });
};
