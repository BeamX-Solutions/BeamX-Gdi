import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  DEFAULT_TEXT_MAX,
  type AnswerValue,
  type QuestionView,
  type ToolQuestion,
} from "../_contract";

export type AnswerError =
  | {
      readonly code: "invalid_answer";
      readonly questionId: string;
      readonly reason: string;
    }
  | { readonly code: "unknown_question"; readonly questionId: string };

type HasQuestions = { readonly questions: readonly ToolQuestion[] };

const oneOf = (values: readonly string[]) =>
  z.string().refine((v) => values.includes(v), "Pick one of the options.");

/** The Zod schema for exactly what a question's card allows (spec 0005, AC-3). */
export const answerSchema = (
  question: QuestionView,
): z.ZodType<AnswerValue> => {
  switch (question.kind) {
    case "single":
      return oneOf(question.options.map((o) => o.value));
    case "multi": {
      const { min, max } = question;
      return z
        .array(oneOf(question.options.map((o) => o.value)))
        .refine(
          (picked) => new Set(picked).size === picked.length,
          "Pick each option once.",
        )
        .refine(
          (picked) => picked.length >= min && picked.length <= max,
          min === 0 ? `Pick up to ${max}.` : `Pick ${min} to ${max}.`,
        );
    }
    case "scale":
      return z
        .number()
        .int("Pick a whole number.")
        .min(question.min, `Pick ${question.min} or more.`)
        .max(question.max, `Pick ${question.max} or less.`);
    case "text": {
      if (question.input === "text") {
        const max = question.maxLength ?? DEFAULT_TEXT_MAX;
        return z
          .string()
          .trim()
          .min(1, "Enter an answer.")
          .max(max, `Keep it to ${max} characters or fewer.`);
      }
      const base =
        question.input === "money"
          ? z.number().int("Enter a whole number of naira.")
          : z.number();
      const withMin =
        question.minValue === undefined
          ? base
          : base.min(question.minValue, `Enter ${question.minValue} or more.`);
      return question.maxValue === undefined
        ? withMin
        : withMin.max(question.maxValue, `Enter ${question.maxValue} or less.`);
    }
    default: {
      const unreachable: never = question;
      return unreachable;
    }
  }
};

/** Checks one answer against its question: the card's rules, then the question's `refine`. */
export const parseQuestionAnswer = (
  question: ToolQuestion,
  value: unknown,
): Result<AnswerValue, AnswerError> => {
  const parsed = answerSchema(question).safeParse(value);
  if (!parsed.success) {
    return err({
      code: "invalid_answer",
      questionId: question.id,
      reason: parsed.error.issues[0]?.message ?? "That answer is not allowed.",
    });
  }
  const reason = question.refine?.(parsed.data) ?? null;
  return reason === null
    ? ok(parsed.data)
    : err({ code: "invalid_answer", questionId: question.id, reason });
};

/** Validates an answer for one of a tool's questions (spec 0005, AC-3). */
export const parseAnswer = (
  tool: HasQuestions,
  questionId: string,
  value: unknown,
): Result<AnswerValue, AnswerError> => {
  const question = tool.questions.find((q) => q.id === questionId);
  return question
    ? parseQuestionAnswer(question, value)
    : err({ code: "unknown_question", questionId });
};
