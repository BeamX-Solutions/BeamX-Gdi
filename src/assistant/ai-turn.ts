/**
 * The AI turn (spec 0006, "AI turn"): one `streamText` call on the `chat` role for a
 * typed message or an approval tap. The tools come from the registry, money actions
 * wait for approval, and after the stream the server appends the card the turn calls
 * for (first card, completion, a reopened card, or the open card again).
 *
 * Prompt layout (AC-13): tools (fixed order) and instructions form the cached prefix,
 * breakpoint 1 on the instructions; the history follows with breakpoint 2 on its last
 * message; the run state note comes last as a turn scoped system message.
 */
import {
  createUIMessageStream,
  stepCountIs,
  streamText,
  type ModelMessage,
  type SystemModelMessage,
  type UIMessageChunk,
} from "ai";
import type { UsageInput } from "@/db/queries/usage";
import type { Result } from "@/lib/result";
import {
  formatAnswer,
  visibleQuestions,
  type AnswerValue,
  type ToolModule,
} from "@/tools/registry";
import {
  afterSave,
  answersFromRows,
  latestShownQuestion,
  openQuestion,
  questionPart,
} from "./card-flow";
import {
  completeRun,
  type NotFound,
  type StepDeps,
  type TurnRun,
} from "./card-steps";
import { extractKnownFacts, usableFacts } from "./extract";
import { INSTRUCTIONS } from "./instructions";
import type { ResolvedModel } from "./model-provider";
import {
  pendingApprovals,
  respondedCalls,
  toModelMessages,
  type AnswerSource,
  type SavedMessage,
  type ServerPart,
} from "./parts";
import { buildRunState } from "./run-state";
import {
  assistantTools,
  TOOL_APPROVAL,
  TOOL_ORDER,
  toolInputRefinement,
  type AssistantToolDeps,
  type OwnerBox,
  type ToolEvent,
} from "./tools";
import {
  partsStream,
  type ActiveRead,
  type AiTurnContext,
  type AiTurnResult,
  type ChatUsage,
} from "./turn";

/** Steps per turn: room for a tool call, its result and a reply, plus one retry. */
export const MAX_STEPS = 5;
export const MAX_OUTPUT_TOKENS = 1024;

/** A run of the chat with its report status (`conversations.open`, newest first). */
export type ChatRun = {
  readonly run: TurnRun;
  readonly report: { readonly status: string } | null;
};

export type AiTurnDeps = StepDeps &
  AssistantToolDeps & {
    /** The last 30 messages (oldest first) and the chat's runs, in one read. */
    readonly openChat: (
      ownerId: string,
      conversationId: string,
    ) => Promise<
      Result<
        {
          readonly messages: readonly SavedMessage[];
          readonly runs: readonly ChatRun[];
        },
        NotFound
      >
    >;
    readonly model: () => ResolvedModel;
    /** The `helper` role, for known facts extraction (AC-5). */
    readonly helperModel: () => ResolvedModel;
    readonly recordUsage: (input: UsageInput) => Promise<unknown>;
    /** A run's saved answers with their sources (the version change offer, AC-5b). */
    readonly oldAnswers: (
      ownerId: string,
      runId: string,
    ) => Promise<Result<readonly OldAnswer[], NotFound>>;
    readonly newId: () => string;
    readonly now: () => number;
  };

/** A saved answer of an earlier run, offered again after a version change (AC-5b). */
export type OldAnswer = {
  readonly questionId: string;
  readonly value: unknown;
  readonly source: AnswerSource;
};

/** The prefill card titles (AC-5, AC-5b). */
export const PREFILL_TITLES = {
  chat: "From our chat",
  lastRun: "From your last run",
} as const;

export const AI_REPLIES = {
  approvalExpired:
    "That confirmation has expired. Tell me what you'd like to do and I'll show a fresh card.",
} as const;

const AI_ERROR: ServerPart = {
  type: "data-error",
  data: { kind: "ai_error", retry: true },
};

const REFUSAL: ServerPart = {
  type: "data-error",
  data: { kind: "refusal", retry: true },
};

const CACHE = { anthropic: { cacheControl: { type: "ephemeral" } } } as const;

/** Breakpoint 1: the instructions close the cached prefix (tools are sent before them). */
export const INSTRUCTIONS_MESSAGE: SystemModelMessage = {
  role: "system",
  content: INSTRUCTIONS,
  providerOptions: CACHE,
};

/** Breakpoint 2 on the last history message. */
export const withHistoryBreakpoint = (
  messages: readonly ModelMessage[],
): ModelMessage[] => {
  const last = messages.at(-1);
  return last === undefined
    ? []
    : [
        ...messages.slice(0, -1),
        {
          ...last,
          providerOptions: { ...last.providerOptions, ...CACHE },
        } as ModelMessage,
      ];
};

/** The run state note, applied until the next user message (never saved). */
export const runStateMessage = (note: string): SystemModelMessage => ({
  role: "system",
  content: note,
  providerOptions: { anthropic: { clearAt: "next_user_message" } },
});

/**
 * The note goes last in every step. The history holds no system messages, so any
 * system message in a step's messages is an earlier copy of the note.
 */
export const withNote = (
  messages: readonly ModelMessage[],
  note: SystemModelMessage,
): ModelMessage[] => [...messages.filter((m) => m.role !== "system"), note];

// ---------------------------------------------------------------------------
// After the stream
// ---------------------------------------------------------------------------

type Live = {
  readonly run: TurnRun;
  readonly tool: ToolModule;
  readonly answers: ReturnType<typeof answersFromRows>;
};

const liveOf = (deps: AiTurnDeps, read: ActiveRead): Live | null => {
  const active = read.active;
  if (active === null) return null;
  const tool = deps.getTool(active.run.toolId);
  if (!tool.ok || tool.value.version !== active.run.toolVersion) return null;
  return {
    run: active.run,
    tool: tool.value,
    answers: answersFromRows(tool.value, active.answers),
  };
};

const lastOf = <K extends ToolEvent["kind"]>(
  events: readonly ToolEvent[],
  kind: K,
): Extract<ToolEvent, { kind: K }> | undefined =>
  events
    .filter((e): e is Extract<ToolEvent, { kind: K }> => e.kind === kind)
    .at(-1);

/** The prefill card for these items, or null when none has a known question. */
const prefillPart = (
  tool: ToolModule,
  runId: string,
  title: string,
  items: readonly {
    readonly questionId: string;
    readonly value: AnswerValue;
    readonly source?: AnswerSource;
  }[],
): ServerPart | null => {
  const shown = items.flatMap((item) => {
    const question = tool.questions.find((q) => q.id === item.questionId);
    return question
      ? [
          {
            questionId: item.questionId,
            prompt: question.prompt,
            value: item.value,
            label: formatAnswer(question, item.value),
            ...(item.source === undefined ? {} : { source: item.source }),
          },
        ]
      : [];
  });
  return shown.length === 0
    ? null
    : { type: "data-prefill", data: { runId, title, items: shown } };
};

/**
 * The card after a run started this turn: known facts from the chat on the prefill card
 * (a new run, AC-5), the old run's answers on it (a restart after a version change,
 * AC-5b), or, for a restart with copied answers, the card the client asked to change.
 * With nothing to offer, the first open card.
 */
const startedParts = async (
  deps: AiTurnDeps,
  turn: {
    readonly conversationId: string;
    readonly owner: OwnerBox;
    readonly history: readonly SavedMessage[];
  },
  live: Live,
  started: Extract<ToolEvent, { kind: "started" }>,
  shown: Extract<ToolEvent, { kind: "show" }> | undefined,
): Promise<readonly ServerPart[]> => {
  const { run, tool, answers } = live;
  const firstCard = (): readonly ServerPart[] => {
    const first = openQuestion(tool, answers, null);
    return first === null ? [] : [questionPart(tool, run.id, answers, first)];
  };
  switch (started.from.kind) {
    case "new": {
      const facts = await extractKnownFacts(
        {
          model: deps.helperModel,
          recordUsage: deps.recordUsage,
          log: deps.log,
          now: deps.now,
        },
        {
          tool,
          history: turn.history,
          answers,
          ownerId: turn.owner.current,
          conversationId: turn.conversationId,
          runId: run.id,
        },
      );
      const card = prefillPart(tool, run.id, PREFILL_TITLES.chat, facts);
      return card === null ? firstCard() : [card];
    }
    case "offer": {
      const old = await deps
        .oldAnswers(turn.owner.current, started.from.previousRunId)
        .catch(() => null);
      const rows = old?.ok ? old.value : [];
      const sourceOf = new Map(rows.map((r) => [r.questionId, r.source]));
      const facts = usableFacts(tool, answers, rows).map((f) => ({
        ...f,
        source: sourceOf.get(f.questionId) ?? "chat",
      }));
      const card = prefillPart(tool, run.id, PREFILL_TITLES.lastRun, facts);
      return card === null ? firstCard() : [card];
    }
    case "copy": {
      // The client restarted to change an answer: open that card if the model named it.
      const asked =
        shown?.runId === run.id
          ? visibleQuestions(tool, answers).find(
              (q) => q.id === shown.questionId,
            )
          : undefined;
      // Every answer was copied, so there may be no open card: start from the first.
      const question =
        asked ??
        openQuestion(tool, answers, null) ??
        visibleQuestions(tool, answers)[0];
      return question === undefined
        ? []
        : [questionPart(tool, run.id, answers, question)];
    }
    default: {
      const unreachable: never = started.from;
      return unreachable;
    }
  }
};

/**
 * The card the turn ends with (spec 0006, "AI turn", AC-8), in this order: a run started
 * this turn shows its prefill or first card; a typed answer that finished the run
 * completes it; otherwise, unless an approval is pending, the reopened card, the next
 * card after a typed answer, or the open card again (also after a resume).
 */
export const partsAfterStream = async (
  deps: AiTurnDeps,
  turn: {
    readonly conversationId: string;
    readonly owner: OwnerBox;
    readonly history: readonly SavedMessage[];
    readonly events: readonly ToolEvent[];
    readonly approvalPending: boolean;
  },
): Promise<readonly ServerPart[]> => {
  const started = lastOf(turn.events, "started");
  const saved = lastOf(turn.events, "saved");
  const shown = lastOf(turn.events, "show");
  if (!started && !saved?.complete && turn.approvalPending) return [];

  const live = liveOf(
    deps,
    await deps.getActive(turn.owner.current, turn.conversationId),
  );
  if (live === null) return [];
  const { run, tool, answers } = live;

  if (started?.runId === run.id)
    return startedParts(deps, turn, live, started, shown);
  if (saved?.complete && saved.runId === run.id)
    return completeRun(deps, turn.conversationId, turn.owner, { run, tool });
  if (turn.approvalPending) return [];

  if (shown?.runId === run.id) {
    const question = tool.questions.find((q) => q.id === shown.questionId);
    const visible = openQuestion(tool, answers, shown.questionId);
    if (question && visible?.id === question.id)
      return [questionPart(tool, run.id, answers, question)];
  }
  if (saved?.runId === run.id) {
    const next = afterSave(tool, answers);
    return next.kind === "card"
      ? [questionPart(tool, run.id, answers, next.question)]
      : completeRun(deps, turn.conversationId, turn.owner, { run, tool });
  }
  const open = openQuestion(
    tool,
    answers,
    latestShownQuestion(turn.history, run.id),
  );
  return open === null ? [] : [questionPart(tool, run.id, answers, open)];
};

/**
 * The card for a guest's run a limit refused this turn (spec 0008, AC-2, AC-4): the
 * daily runs or the spend cap. It is saved with the reply, like any card. Pure.
 */
export const refusedParts = (
  events: readonly ToolEvent[],
): readonly ServerPart[] => {
  const refused = lastOf(events, "refused");
  return refused === undefined
    ? []
    : [{ type: "data-error", data: { kind: refused.reason, retry: false } }];
};

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

/**
 * The text a failed tool call is saved with: the same text the model received (the AI
 * SDK's `error.toString()`), so the next turn replays an identical, non empty tool
 * result. Anthropic rejects an empty error result, and with thinking it also rejects a
 * changed one, either way on every later turn. Stream errors never get here: the loop
 * below drops them and shows the try again card.
 */
export const toolErrorText = (error: unknown): string => {
  if (error == null) return "unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.toString();
  return JSON.stringify(error);
};

const writeParts = (
  writer: { write: (chunk: UIMessageChunk) => void },
  parts: readonly ServerPart[],
  newId: () => string,
) => {
  for (const part of parts) {
    if (part.type === "text") {
      const id = newId();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: part.text });
      writer.write({ type: "text-end", id });
    } else {
      writer.write({ type: part.type, data: part.data });
    }
  }
};

/** One step's usage, as `onStepEnd` reports it. */
type StepUsage = {
  readonly usage: {
    readonly inputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
    readonly inputTokenDetails?:
      | {
          readonly cacheReadTokens?: number | undefined;
          readonly cacheWriteTokens?: number | undefined;
        }
      | undefined;
  };
  readonly response: { readonly modelId: string };
};

/**
 * The turn's totals from its steps (spec 0007, step 6). A missing count is 0; `model`
 * is the last step's response model. Null when no step ran. Pure.
 */
export const sumUsage = (steps: readonly StepUsage[]): ChatUsage | null => {
  const last = steps.at(-1);
  if (last === undefined) return null;
  const n = (v: number | undefined) =>
    v !== undefined && Number.isFinite(v) && v > 0 ? v : 0;
  return steps.reduce<ChatUsage>(
    (total, step) => ({
      model: total.model,
      inputTokens: total.inputTokens + n(step.usage.inputTokens),
      outputTokens: total.outputTokens + n(step.usage.outputTokens),
      cacheReadTokens:
        total.cacheReadTokens +
        n(step.usage.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens:
        total.cacheWriteTokens +
        n(step.usage.inputTokenDetails?.cacheWriteTokens),
    }),
    {
      model: last.response.modelId,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  );
};

const NO_USAGE: Promise<ChatUsage | null> = Promise.resolve(null);
const FAILED: Promise<boolean> = Promise.resolve(true);
const NOT_FAILED: Promise<boolean> = Promise.resolve(false);

/**
 * Builds `TurnDeps.aiTurn`. The stream holds no start or finish chunk (#7 wraps it).
 * `usage` settles when the stream's work ends, however it ends.
 */
export const createAiTurn =
  (deps: AiTurnDeps) =>
  async (ctx: AiTurnContext): Promise<AiTurnResult> => {
    const started = deps.now();
    const chat = await deps.openChat(ctx.ownerId, ctx.conversationId);
    if (!chat.ok)
      return {
        stream: partsStream([AI_ERROR], deps.newId),
        usage: NO_USAGE,
        failed: FAILED,
      };
    const history = chat.value.messages;

    if (
      ctx.turn.kind === "approval" &&
      pendingApprovals(history, ctx.turn.responses).length === 0
    )
      return {
        stream: partsStream(
          [{ type: "text", text: AI_REPLIES.approvalExpired }],
          deps.newId,
        ),
        usage: NO_USAGE,
        failed: NOT_FAILED,
      };

    const noteFor = (read: ActiveRead) => {
      const active = read.active;
      const tool = active === null ? null : deps.getTool(active.run.toolId);
      return runStateMessage(
        buildRunState({
          getTool: deps.getTool,
          active:
            active === null
              ? null
              : {
                  runId: active.run.id,
                  toolId: active.run.toolId,
                  answers: tool?.ok
                    ? answersFromRows(tool.value, active.answers)
                    : {},
                  latestShownId: latestShownQuestion(history, active.run.id),
                },
          paused: read.paused.map((r) => ({ runId: r.id, toolId: r.toolId })),
          runs: chat.value.runs.map((r) => ({
            runId: r.run.id,
            toolId: r.run.toolId,
            status: r.run.status,
            reportStatus: r.report?.status ?? null,
          })),
          ...(ctx.freeMessagesLeft === undefined
            ? {}
            : { freeMessagesLeft: ctx.freeMessagesLeft }),
        }),
      );
    };

    const messages = withHistoryBreakpoint(await toModelMessages(history));
    const owner: OwnerBox = { current: ctx.ownerId };
    // What the tools did this turn; local to this call, read after the stream.
    const events: ToolEvent[] = [];
    const env = {
      deps,
      conversationId: ctx.conversationId,
      owner,
      isGuest: ctx.isGuest,
      ip: ctx.ip,
      record: (event: ToolEvent) => {
        events.push(event);
      },
      recorded: (): readonly ToolEvent[] => events,
    };
    const model = deps.model();
    // The note as of the last tool event. An approved call runs before the first step
    // and a tool may change the run mid turn, so the note is read again after either.
    const note = { message: noteFor(ctx.active), events: 0 };
    const currentNote = async () => {
      if (events.length !== note.events) {
        note.events = events.length;
        note.message = noteFor(
          await deps.getActive(owner.current, ctx.conversationId),
        );
      }
      return note.message;
    };
    const responded =
      ctx.turn.kind === "approval"
        ? respondedCalls(history, ctx.turn.responses)
        : new Map<string, { toolName: string; input: unknown }>();
    const introduced = new Set<string>();
    // Each finished step's usage, read once the stream's work ends.
    const steps: StepUsage[] = [];
    const settled: {
      resolve: (usage: ChatUsage | null) => void;
      fail: (failed: boolean) => void;
      failed: boolean;
    } = { resolve: () => {}, fail: () => {}, failed: true };
    const usage = new Promise<ChatUsage | null>((resolve) => {
      settled.resolve = resolve;
    });
    const failed = new Promise<boolean>((resolve) => {
      settled.fail = resolve;
    });

    const result = streamText({
      model: model.model,
      instructions: INSTRUCTIONS_MESSAGE,
      messages,
      allowSystemInMessages: true,
      tools: assistantTools(env),
      toolOrder: [...TOOL_ORDER],
      toolApproval: TOOL_APPROVAL,
      experimental_refineToolInput: toolInputRefinement(env),
      prepareStep: async ({ messages: stepMessages }) => ({
        messages: withNote(stepMessages, await currentNote()),
      }),
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      onStepEnd: (step) => {
        steps.push(step);
      },
      providerOptions: {
        anthropic: { ...model.providerOptions.anthropic, fallbacks: "default" },
      },
    });

    const writeTurn = async (writer: {
      write: (chunk: UIMessageChunk) => void;
    }) => {
      const seen = { approvalPending: false, failed: false };
      for await (const chunk of result.toUIMessageStream({
        sendStart: false,
        sendFinish: false,
        onError: toolErrorText,
      })) {
        if (chunk.type === "error") {
          seen.failed = true;
          continue;
        }
        if (chunk.type === "tool-approval-request") seen.approvalPending = true;
        if ("toolCallId" in chunk) {
          const call = responded.get(chunk.toolCallId);
          if (call && !introduced.has(chunk.toolCallId))
            writer.write({
              type: "tool-input-available",
              toolCallId: chunk.toolCallId,
              toolName: call.toolName,
              input: call.input,
            });
          introduced.add(chunk.toolCallId);
        }
        if (
          chunk.type === "tool-input-available" &&
          chunk.toolName === "startRun"
        ) {
          const toolId = (chunk.input as { toolId?: unknown }).toolId;
          deps.log("assistant_route", {
            toolId: typeof toolId === "string" ? toolId : null,
          });
        }
        writer.write(chunk);
      }

      const finish = seen.failed
        ? null
        : await Promise.resolve(result.finishReason).catch(() => null);
      const steps = await Promise.resolve(result.steps)
        .then((s) => s.length)
        .catch(() => 0);
      // The AI call finished (a refusal included); `finish` null means it failed.
      settled.failed = finish === null;
      if (finish === "content-filter")
        deps.log("assistant_refusal", { conversationId: ctx.conversationId });
      const parts =
        finish === null
          ? [AI_ERROR]
          : finish === "content-filter"
            ? [REFUSAL]
            : await partsAfterStream(deps, {
                conversationId: ctx.conversationId,
                owner,
                history,
                events,
                approvalPending: seen.approvalPending,
              }).catch(() => [AI_ERROR]);
      writeParts(writer, [...parts, ...refusedParts(events)], deps.newId);
      deps.log("assistant_turn", {
        path: "ai_done",
        conversationId: ctx.conversationId,
        steps,
        approvalPending: seen.approvalPending,
        ms: deps.now() - started,
      });
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          await writeTurn(writer);
        } finally {
          settled.resolve(sumUsage(steps));
          settled.fail(settled.failed);
        }
      },
    });

    return { stream, usage, failed };
  };
