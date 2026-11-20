import type { Answers, QuestionProgress, ToolQuestion } from "../_contract";

type HasQuestions = { readonly questions: readonly ToolQuestion[] };

/**
 * The questions whose `when` passes, in list order (spec 0005, AC-4).
 *
 * Each `when` sees only the answers to visible questions before it, so an answer left
 * behind on a question that later became hidden can never unlock another question.
 */
export const visibleQuestions = (
  tool: HasQuestions,
  answers: Answers,
): readonly ToolQuestion[] =>
  tool.questions.reduce<{
    readonly visible: readonly ToolQuestion[];
    readonly seen: Answers;
  }>(
    (acc, question) => {
      if (question.when && !question.when(acc.seen)) return acc;
      const value = answers[question.id];
      return {
        visible: [...acc.visible, question],
        seen:
          value === undefined
            ? acc.seen
            : { ...acc.seen, [question.id]: value },
      };
    },
    { visible: [], seen: {} },
  ).visible;

/** Only the answers to visible questions: what scoring and prompts may read. */
export const visibleAnswers = (tool: HasQuestions, answers: Answers): Answers =>
  Object.fromEntries(
    visibleQuestions(tool, answers).flatMap((q) => {
      const value = answers[q.id];
      return value === undefined ? [] : [[q.id, value] as const];
    }),
  );

/** The first visible question with no answer yet, or `null` when none is left. */
export const nextQuestion = (
  tool: HasQuestions,
  answers: Answers,
): ToolQuestion | null =>
  visibleQuestions(tool, answers).find((q) => answers[q.id] === undefined) ??
  null;

/** The visible questions that still have no answer, by id. */
export const missingAnswers = (
  tool: HasQuestions,
  answers: Answers,
): readonly string[] =>
  visibleQuestions(tool, answers)
    .filter((q) => answers[q.id] === undefined)
    .map((q) => q.id);

export type Progress = { readonly answered: number; readonly total: number };

/** Answered out of total, counting visible questions only. */
export const progress = (tool: HasQuestions, answers: Answers): Progress => {
  const visible = visibleQuestions(tool, answers);
  return {
    answered: visible.filter((q) => answers[q.id] !== undefined).length,
    total: visible.length,
  };
};

/**
 * Where one question sits among the visible questions, for its card (spec 0006). With
 * areas, the area is counted among the visible areas in order of first appearance, and
 * the question is counted within its area. Returns null for a question that is not
 * visible.
 */
export const questionProgress = (
  tool: HasQuestions,
  answers: Answers,
  questionId: string,
): QuestionProgress | null => {
  const visible = visibleQuestions(tool, answers);
  const question = visible.find((q) => q.id === questionId);
  if (!question) return null;
  const position = (list: readonly ToolQuestion[]) => ({
    index: list.findIndex((q) => q.id === questionId) + 1,
    total: list.length,
  });
  const area = question.area;
  if (area === undefined) return { question: position(visible) };
  const areas = [
    ...new Set(visible.flatMap((q) => (q.area === undefined ? [] : [q.area]))),
  ];
  return {
    area: { index: areas.indexOf(area) + 1, total: areas.length, name: area },
    question: position(visible.filter((q) => q.area === area)),
  };
};
