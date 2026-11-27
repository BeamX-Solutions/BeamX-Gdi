/**
 * An in-memory world for the real model eval (spec 0006, AC-15): the AI turn's query
 * deps backed by plain data, so a case runs the real instructions, tools, approvals and
 * registry on the real model, with no database. Money tools never run past their
 * approval card here (single turn cases), and nothing is written anywhere.
 */
import { ok, err } from "@/lib/result";
import type { AiTurnDeps, ChatRun } from "@/assistant/ai-turn";
import type { ResolvedModel } from "@/assistant/model-provider";
import type { SavedMessage } from "@/assistant/parts";
import type { ActiveRead, AiTurnContext, TurnRun } from "@/assistant/turn";
import type { RunQuote } from "@/db/queries/credits";
import type { ReportRead } from "@/assistant/tools/read-report";
import { FAKE_STELLAR_ANALYSIS } from "@/lib/fake-model";
import {
  getReader,
  getTool,
  tools,
  type AnswerValue,
  type StoredAnswer,
} from "@/tools/registry";
import type { CaseSetup } from "./cases";

export const EVAL_USER = "0190e000-0000-7000-8000-0000000000e1";
export const EVAL_CONVERSATION = "0190e000-0000-7000-8000-0000000000c1";

/** The ids behind the `@active`, `@paused` and `@completed` refs in cases. */
export const RUN_IDS = {
  active: "0190e000-0000-7000-8000-000000000001",
  paused: "0190e000-0000-7000-8000-000000000002",
  completed: "0190e000-0000-7000-8000-000000000003",
} as const;

/** The eval runs every case against Stellar (the only tool cases set up runs for). */
const SETUP_TOOL = "stellar";

/** Swaps `@active` style refs for the run ids. Pure. */
export const resolveRefs = (
  input: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(input).map(([k, v]) => {
      const ref = v.startsWith("@") ? v.slice(1) : null;
      return [
        k,
        ref !== null && ref in RUN_IDS
          ? RUN_IDS[ref as keyof typeof RUN_IDS]
          : v,
      ];
    }),
  );

export type EvalWorld = {
  readonly history: SavedMessage[];
  answers: StoredAnswer[] | null;
  readonly setup: NonNullable<CaseSetup> | Record<string, never>;
  readonly logs: { event: string; fields: Record<string, unknown> }[];
};

const version = (): string => {
  const tool = getTool(SETUP_TOOL);
  if (!tool.ok) throw new Error(`the eval needs the ${SETUP_TOOL} tool`);
  return tool.value.version;
};

const runRow = (id: string, status: string): TurnRun => ({
  id,
  toolId: SETUP_TOOL,
  toolVersion: version(),
  status,
});

const storedAnswers = (
  answers: Readonly<Record<string, AnswerValue>>,
): StoredAnswer[] =>
  Object.entries(answers).map(([questionId, value], i) => ({
    questionId,
    value,
    updatedAt: `2026-11-20 10:00:${String(i).padStart(2, "0")}+00`,
  }));

/** A Stellar answer for every question: the first option, or a short sentence. */
const completedAnswers = (): Readonly<Record<string, AnswerValue>> => {
  const tool = getTool(SETUP_TOOL);
  if (!tool.ok) return {};
  return Object.fromEntries(
    tool.value.questions.map((q) => [
      q.id,
      q.kind === "single"
        ? (q.options[0]?.value ?? "")
        : q.kind === "multi"
          ? [q.options[0]?.value ?? ""]
          : q.kind === "scale"
            ? q.min
            : "Fresh bread for offices in Yaba.",
    ]),
  );
};

/**
 * `readRun` over the world (spec 0014): the `@completed` run, scored by the real tool,
 * with the fake model's Stellar analysis as its ready report. Any other run is unknown.
 */
const readRunOf = (world: EvalWorld, runId: string) => {
  const tool = getTool(SETUP_TOOL);
  if (runId !== RUN_IDS.completed || world.setup.completed !== true || !tool.ok)
    return err({ code: "not_found" } as const);
  const answers = completedAnswers();
  const scored = tool.value.score(answers);
  const read: ReportRead = {
    run: {
      toolId: SETUP_TOOL,
      toolVersion: version(),
      completedAt: "2026-11-24 10:00:00+00",
      scores: scored.ok ? scored.value : null,
    },
    answers: storedAnswers(answers),
    report: { status: "ready", content: { analysis: FAKE_STELLAR_ANALYSIS } },
  };
  return ok(read);
};

export const makeWorld = (setup: CaseSetup): EvalWorld => ({
  history: [],
  answers:
    setup?.active === undefined ? null : storedAnswers(setup.active.answers),
  setup: setup ?? {},
  logs: [],
});

export const activeOf = (world: EvalWorld): ActiveRead => ({
  active:
    world.answers === null
      ? null
      : {
          run: runRow(RUN_IDS.active, "in_progress"),
          answers: [...world.answers],
        },
  paused:
    world.setup.paused === undefined ? [] : [runRow(RUN_IDS.paused, "paused")],
});

const chatRuns = (world: EvalWorld): ChatRun[] =>
  world.setup.completed === true
    ? [
        {
          run: runRow(RUN_IDS.completed, "completed"),
          report: { status: "ready" },
        },
      ]
    : [];

const quoteOf = (world: EvalWorld, runId: string): RunQuote | null => {
  const base = {
    toolId: SETUP_TOOL,
    toolVersion: version(),
    conversationId: EVAL_CONVERSATION,
  };
  if (runId === RUN_IDS.active && world.answers !== null)
    return { ...base, status: "in_progress", heldAmount: 30 };
  if (runId === RUN_IDS.paused && world.setup.paused !== undefined)
    return {
      ...base,
      status: "paused",
      heldAmount: world.setup.paused.held ? 30 : null,
    };
  if (runId === RUN_IDS.completed && world.setup.completed === true)
    return { ...base, status: "completed", heldAmount: null };
  return null;
};

/** The AI turn's deps over the world, on the given real models. */
export const evalDeps = (
  world: EvalWorld,
  models: { readonly chat: ResolvedModel; readonly helper: ResolvedModel },
): AiTurnDeps => {
  const n = { id: 0 };
  return {
    ownerOf: async () => ok(EVAL_USER),
    getRun: async (_o, runId) =>
      ok({
        run: runRow(runId, "in_progress"),
        answers: [...(world.answers ?? [])],
      }),
    complete: async () => ok({}),
    log: (event, fields) => world.logs.push({ event, fields }),
    tools,
    getTool,
    getActive: async () => activeOf(world),
    saveAnswer: async (_o, _r, questionId, value) => {
      world.answers = [
        ...(world.answers ?? []).filter((a) => a.questionId !== questionId),
        { questionId, value, updatedAt: "2026-11-20 10:01:00+00" },
      ];
      return ok({});
    },
    ensureAccount: async () => ({ created: false, granted: 0 }),
    startRunWithHold: async () => ok({ runId: RUN_IDS.active }),
    getSummary: async () => null,
    runQuote: async (_o, runId) => {
      const quote = quoteOf(world, runId);
      return quote === null ? err({ code: "not_found" }) : ok(quote);
    },
    resumeRun: async (_o, runId) => ok({ runId }),
    resumeRunWithHold: async (_o, runId) => ok({ runId }),
    startFromWithHold: async () => ok({ runId: RUN_IDS.active }),
    abandonRun: async () => ok({}),
    offerConsultation: async () =>
      ok({
        id: "00000000-0000-4000-8000-0000000000c1",
        status: "offered" as const,
        startTime: null,
      }),
    calendlyUrl: "https://calendly.com/beamxsolutions",
    limits: {
      guestSpendCap: async () => ok(undefined),
      takeRun: async () => ok({ keys: [] }),
      giveBackRun: async () => {},
    },
    openChat: async () =>
      ok({ messages: [...world.history], runs: chatRuns(world) }),
    model: () => models.chat,
    helperModel: () => models.helper,
    recordUsage: async () => ({ status: "recorded", id: "eval" }),
    profileFacts: async () => [],
    getReader,
    readRun: async (_o, runId) => readRunOf(world, runId),
    recentReports: async () => [],
    oldAnswers: async () => ok([]),
    newId: () => `eval-${++n.id}`,
    now: () => Date.now(),
  };
};

/** A typed message turn: the message joins the history, as `handleTurn` saves it first. */
export const textTurn = (
  world: EvalWorld,
  id: string,
  text: string,
): AiTurnContext => {
  world.history.push({ id, role: "user", parts: [{ type: "text", text }] });
  return {
    ownerId: EVAL_USER,
    conversationId: EVAL_CONVERSATION,
    message: { id, role: "user", parts: [{ type: "text", text }] },
    active: activeOf(world),
    isGuest: false,
    ip: null,
    turn: { kind: "text", text },
  };
};
