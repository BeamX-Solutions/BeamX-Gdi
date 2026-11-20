/**
 * The pure decisions of the card path (spec 0006, AC-5, AC-6, AC-6b, AC-7): which card is
 * open, whether a tapped answer is saved, what comes after a save, and which prefill
 * items a client accepted. Every function takes plain data and returns plain data; the
 * caller (`turn.ts`) runs the queries.
 */
import {
  nextQuestion,
  parseAnswer,
  questionProgress,
  visibleQuestions,
  type Answers,
  type AnswerValue,
  type ToolModule,
  type ToolQuestion,
} from "@/tools/registry";
import {
  prefillData,
  questionData,
  type AnswerData,
  type PrefillData,
  type PrefillResponseData,
  type SavedMessage,
  type ServerPart,
} from "./parts";

type HasQuestions = Pick<ToolModule, "questions">;

/** The short notes shown on a card that comes back (AC-6). */
export const CARD_NOTES = {
  hidden: "That question isn't part of this run any more.",
  otherRun: "That card is from another run. Here's where we are now.",
} as const;

/** Plain chat replies for cases with no card to show. */
export const CARD_REPLIES = {
  noActiveRun:
    "That run isn't open any more. Tell me what you'd like to do next.",
  oldVersion:
    "This run was started on an older version of the tool, so it can't continue. Ask me to start it again.",
} as const;

/**
 * A run's stored answers as `Answers`. Each value is checked with `parseAnswer`; one
 * that no longer parses (or names a question the tool doesn't know) is left out, so it
 * is asked again. Hidden answers stay in: visibility is worked out by the flow helpers.
 */
export const answersFromRows = (
  tool: HasQuestions,
  rows: readonly { readonly questionId: string; readonly value: unknown }[],
): Answers =>
  Object.fromEntries(
    rows.flatMap((row) => {
      const parsed = parseAnswer(tool, row.questionId, row.value);
      return parsed.ok ? [[row.questionId, parsed.value] as const] : [];
    }),
  );

const isVisible = (tool: HasQuestions, answers: Answers, questionId: string) =>
  visibleQuestions(tool, answers).some((q) => q.id === questionId);

type LoosePart = { readonly type?: unknown; readonly data?: unknown };

/** Every part of one type in the history, oldest first, parsed with its schema. */
const partsOf = <T>(
  messages: readonly SavedMessage[],
  type: string,
  parse: (data: unknown) => T | null,
): readonly T[] =>
  messages.flatMap((m) =>
    (Array.isArray(m.parts) ? (m.parts as readonly LoosePart[]) : []).flatMap(
      (p) => {
        if (p?.type !== type) return [];
        const value = parse(p.data);
        return value === null ? [] : [value];
      },
    ),
  );

/** The question id of the latest `data-question` shown for a run, or null. */
export const latestShownQuestion = (
  messages: readonly SavedMessage[],
  runId: string,
): string | null =>
  partsOf(messages, "data-question", (data) => {
    const parsed = questionData.safeParse(data);
    return parsed.success && parsed.data.runId === runId
      ? parsed.data.questionId
      : null;
  }).at(-1) ?? null;

/** The latest `data-prefill` card shown for a run, or null. */
export const latestPrefill = (
  messages: readonly SavedMessage[],
  runId: string,
): PrefillData | null =>
  partsOf(messages, "data-prefill", (data) => {
    const parsed = prefillData.safeParse(data);
    return parsed.success && parsed.data.runId === runId ? parsed.data : null;
  }).at(-1) ?? null;

/**
 * The open card (AC-6b): the question of the latest `data-question` for the active run,
 * if it is still visible, otherwise the next unanswered question. Null when every
 * visible question is answered.
 */
export const openQuestion = (
  tool: HasQuestions,
  answers: Answers,
  latestShownId: string | null,
): ToolQuestion | null => {
  const shown =
    latestShownId === null
      ? undefined
      : visibleQuestions(tool, answers).find((q) => q.id === latestShownId);
  return shown ?? nextQuestion(tool, answers);
};

/** Strips the tool only fields (`when`, `refine`, …) to the card's view. */
const toView = (question: ToolQuestion) => {
  switch (question.kind) {
    case "single":
      return {
        kind: question.kind,
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        ...(question.help === undefined ? {} : { help: question.help }),
      };
    case "multi":
      return {
        kind: question.kind,
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        min: question.min,
        max: question.max,
        ...(question.help === undefined ? {} : { help: question.help }),
      };
    case "scale":
      return {
        kind: question.kind,
        id: question.id,
        prompt: question.prompt,
        min: question.min,
        max: question.max,
        minLabel: question.minLabel,
        maxLabel: question.maxLabel,
        ...(question.help === undefined ? {} : { help: question.help }),
      };
    case "text":
      return {
        kind: question.kind,
        id: question.id,
        prompt: question.prompt,
        input: question.input,
        ...(question.help === undefined ? {} : { help: question.help }),
        ...(question.placeholder === undefined
          ? {}
          : { placeholder: question.placeholder }),
        ...(question.maxLength === undefined
          ? {}
          : { maxLength: question.maxLength }),
        ...(question.minValue === undefined
          ? {}
          : { minValue: question.minValue }),
        ...(question.maxValue === undefined
          ? {}
          : { maxValue: question.maxValue }),
      };
    default: {
      const unreachable: never = question;
      return unreachable;
    }
  }
};

/** The `data-question` part for a visible question, with its progress (AC-6). */
export const questionPart = (
  tool: HasQuestions,
  runId: string,
  answers: Answers,
  question: ToolQuestion,
  note?: string,
): ServerPart => ({
  type: "data-question",
  data: {
    runId,
    questionId: question.id,
    view: toView(question),
    // A question handed in here is visible, so progress is never null; the fallback
    // only keeps the type honest.
    progress: questionProgress(tool, answers, question.id) ?? {
      question: { index: 1, total: 1 },
    },
    ...(note === undefined ? {} : { note }),
  },
});

export type AnswerDecision =
  | {
      readonly kind: "save";
      readonly questionId: string;
      readonly value: AnswerValue;
    }
  | { readonly kind: "reject"; readonly note: string };

/**
 * Whether a tapped answer is saved (AC-6). The question must be visible over the
 * current answers, and the value must pass `parseAnswer`. Any visible question may be
 * answered again (an edit from an answered bubble).
 */
export const decideAnswer = (
  tool: HasQuestions,
  answers: Answers,
  submitted: Pick<AnswerData, "questionId" | "value">,
): AnswerDecision => {
  if (!isVisible(tool, answers, submitted.questionId))
    return { kind: "reject", note: CARD_NOTES.hidden };
  const parsed = parseAnswer(tool, submitted.questionId, submitted.value);
  if (!parsed.ok)
    return {
      kind: "reject",
      note:
        parsed.error.code === "invalid_answer"
          ? parsed.error.reason
          : CARD_NOTES.hidden,
    };
  return {
    kind: "save",
    questionId: submitted.questionId,
    value: parsed.value,
  };
};

export type AfterSave =
  | { readonly kind: "card"; readonly question: ToolQuestion }
  | { readonly kind: "complete" };

/** What follows a save, worked out again over all answers with visibility (AC-6, AC-7). */
export const afterSave = (tool: HasQuestions, answers: Answers): AfterSave => {
  const next = nextQuestion(tool, answers);
  return next === null
    ? { kind: "complete" }
    : { kind: "card", question: next };
};

export type PrefillDecision = {
  /** The accepted items to save with `source = 'chat'`, in card order. */
  readonly saves: readonly {
    readonly questionId: string;
    readonly value: AnswerValue;
  }[];
  /** The question whose card the client asked to edit, if it is visible after saving. */
  readonly edit: string | null;
};

/**
 * Which prefill items to save (AC-5). Only items on the card the server showed count,
 * and each must still parse, still be unanswered, and be visible over the current
 * answers plus the other accepted items. The client sends ids only; values always come
 * from the server written card.
 */
export const decidePrefill = (
  tool: HasQuestions,
  answers: Answers,
  card: PrefillData | null,
  response: Pick<PrefillResponseData, "accept" | "edit">,
): PrefillDecision => {
  const accepted = (card?.items ?? []).flatMap((item) => {
    if (!response.accept.includes(item.questionId)) return [];
    if (answers[item.questionId] !== undefined) return [];
    const parsed = parseAnswer(tool, item.questionId, item.value);
    return parsed.ok
      ? [{ questionId: item.questionId, value: parsed.value }]
      : [];
  });
  const merged: Answers = {
    ...answers,
    ...Object.fromEntries(accepted.map((a) => [a.questionId, a.value])),
  };
  const visible = new Set(visibleQuestions(tool, merged).map((q) => q.id));
  const saves = accepted.filter((a) => visible.has(a.questionId));
  const after: Answers = {
    ...answers,
    ...Object.fromEntries(saves.map((a) => [a.questionId, a.value])),
  };
  const edit =
    response.edit !== null && isVisible(tool, after, response.edit)
      ? response.edit
      : null;
  return { saves, edit };
};
