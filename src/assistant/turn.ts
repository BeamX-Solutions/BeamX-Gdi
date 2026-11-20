/**
 * `handleTurn`, the one entry point #7's chat route calls (spec 0006, AC-1). It resolves
 * the owner, takes the per conversation turn lock, saves the user message, then picks
 * a path: card parts (answers, prefill responses, completion retries) are handled here
 * with no AI call; approval responses and typed text go to the AI turn.
 *
 * Every side effect comes through `deps`, so tests run it with fakes or against a real
 * Neon branch.
 */
import { createUIMessageStream, type UIMessageChunk } from "ai";
import type { NewMessage } from "@/db/queries/messages";
import type { CompleteError } from "@/db/queries/runs";
import { err, ok, type Result } from "@/lib/result";
import type { TurnLock } from "@/lib/turn-lock";
import {
  scoreRun,
  type StoredAnswer,
  type ToolModule,
  type UnknownTool,
} from "@/tools/registry";
import {
  afterSave,
  answersFromRows,
  CARD_NOTES,
  CARD_REPLIES,
  decideAnswer,
  decidePrefill,
  latestPrefill,
  latestShownQuestion,
  openQuestion,
  questionPart,
} from "./card-flow";
import {
  classifyMessage,
  type AnswerData,
  type ApprovalResponse,
  type InvalidMessage,
  type PrefillResponseData,
  type SavedMessage,
  type ServerPart,
  type UserMessage,
} from "./parts";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

type NotFound = { readonly code: "not_found" };

/** The run fields the turn reads (a `tool_run` row satisfies it). */
export type TurnRun = {
  readonly id: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly status: string;
};

/** `runs.getActive`: the chat's active run with its answers, plus its paused runs. */
export type ActiveRead = {
  readonly active: {
    readonly run: TurnRun;
    readonly answers: readonly StoredAnswer[];
  } | null;
  readonly paused: readonly TurnRun[];
};

export type AiTurnContext = {
  readonly ownerId: string;
  readonly conversationId: string;
  readonly message: UserMessage;
  readonly active: ActiveRead;
  readonly turn:
    | { readonly kind: "text"; readonly text: string }
    | {
        readonly kind: "approval";
        readonly responses: readonly ApprovalResponse[];
      };
};

export type TurnDeps = {
  readonly ownerOf: (
    conversationId: string,
  ) => Promise<Result<string, NotFound>>;
  readonly lock: TurnLock;
  readonly appendMessage: (
    ownerId: string,
    conversationId: string,
    message: NewMessage,
  ) => Promise<Result<number, NotFound>>;
  readonly getActive: (
    ownerId: string,
    conversationId: string,
  ) => Promise<ActiveRead>;
  /** The latest messages of the chat, oldest first (the open card and prefill lookups). */
  readonly recentMessages: (
    ownerId: string,
    conversationId: string,
  ) => Promise<readonly SavedMessage[]>;
  readonly getRun: (
    ownerId: string,
    runId: string,
  ) => Promise<
    Result<
      { readonly run: TurnRun; readonly answers: readonly StoredAnswer[] },
      NotFound
    >
  >;
  readonly saveAnswer: (
    ownerId: string,
    runId: string,
    questionId: string,
    value: unknown,
    source: "client" | "chat",
  ) => Promise<
    Result<unknown, { readonly code: "not_found_or_not_in_progress" }>
  >;
  readonly complete: (
    ownerId: string,
    runId: string,
    scores: unknown,
    answerCount: number,
    lastAnswerAt: string | null,
  ) => Promise<Result<unknown, CompleteError>>;
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  /** The AI turn (build plan task 3). Returns the model's UI message stream. */
  readonly aiTurn: (
    context: AiTurnContext,
  ) => Promise<ReadableStream<UIMessageChunk>>;
  readonly newId: () => string;
  readonly now: () => number;
  readonly log: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

// ---------------------------------------------------------------------------
// Input and output
// ---------------------------------------------------------------------------

export type TurnInput = {
  readonly userId: string;
  readonly conversationId: string;
  /** The new user message, validated here. */
  readonly message: unknown;
  /** What #7's route already read in its `turnContext` batch (spec 0007), reused here. */
  readonly context?: {
    readonly ownerId: string;
    readonly active?: ActiveRead;
  };
};

export type TurnOutput = {
  readonly stream: ReadableStream<UIMessageChunk>;
  /** Whether this turn counts toward paid chat (spec 0004, AC-9). */
  readonly metered: boolean;
};

export type TurnError = NotFound | InvalidMessage;

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

/** The server's parts as UI message chunks (the route wraps them in its own message). */
export const partsStream = (
  parts: readonly ServerPart[],
  newId: () => string,
): ReadableStream<UIMessageChunk> =>
  createUIMessageStream({
    execute: ({ writer }) => {
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
    },
  });

/** Runs `onDone` once the stream ends, fails, or is cancelled (the AI turn's lock). */
const whenDone = (
  stream: ReadableStream<UIMessageChunk>,
  onDone: () => Promise<void>,
): ReadableStream<UIMessageChunk> => {
  const reader = stream.getReader();
  const done = { called: false };
  const finish = async () => {
    if (done.called) return;
    done.called = true;
    await onDone();
  };
  return new ReadableStream<UIMessageChunk>({
    pull: async (controller) => {
      try {
        const next = await reader.read();
        if (next.done) {
          await finish();
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (e) {
        await finish();
        controller.error(e);
      }
    },
    cancel: async (reason) => {
      await finish();
      await reader.cancel(reason);
    },
  });
};

const BUSY: ServerPart = {
  type: "data-error",
  data: { kind: "busy", retry: false },
};

// ---------------------------------------------------------------------------
// Owner retry
// ---------------------------------------------------------------------------

const RETRY_CODES = new Set(["not_found", "not_found_or_not_in_progress"]);

type Owner = { readonly current: string };

/**
 * Runs a write as the owner resolved at turn start. If it comes back `not_found`, the
 * owner is read again; if a guest link moved the chat, the write is retried once as the
 * new owner (spec 0006, "Owner").
 */
const asOwner = async <T, E extends { readonly code: string }>(
  deps: TurnDeps,
  conversationId: string,
  owner: Owner,
  write: (ownerId: string) => Promise<Result<T, E>>,
): Promise<{ readonly owner: Owner; readonly result: Result<T, E> }> => {
  const first = await write(owner.current);
  if (first.ok || !RETRY_CODES.has(first.error.code))
    return { owner, result: first };
  const reread = await deps.ownerOf(conversationId);
  if (!reread.ok || reread.value === owner.current)
    return { owner, result: first };
  const moved: Owner = { current: reread.value };
  return { owner: moved, result: await write(moved.current) };
};

// ---------------------------------------------------------------------------
// The card path
// ---------------------------------------------------------------------------

type CardContext = {
  readonly deps: TurnDeps;
  readonly conversationId: string;
  readonly owner: Owner;
  readonly active: ActiveRead;
  readonly recent: readonly SavedMessage[];
};

type LiveRun = {
  readonly run: TurnRun;
  readonly tool: ToolModule;
  readonly rows: readonly StoredAnswer[];
};

/**
 * The active run, if it is the one the card belongs to and its tool is current.
 * Otherwise the reply to show instead: the active run's open card with a note, or a
 * short text when there is nothing to show.
 */
const liveRun = (
  ctx: CardContext,
  runId: string,
): Result<LiveRun, readonly ServerPart[]> => {
  const active = ctx.active.active;
  if (active === null)
    return err([{ type: "text", text: CARD_REPLIES.noActiveRun }]);
  const tool = ctx.deps.getTool(active.run.toolId);
  if (!tool.ok || tool.value.version !== active.run.toolVersion)
    return err([{ type: "text", text: CARD_REPLIES.oldVersion }]);
  const live = { run: active.run, tool: tool.value, rows: active.answers };
  if (active.run.id !== runId)
    return err(openCard(ctx, live, CARD_NOTES.otherRun));
  return ok(live);
};

/** The open card of a live run (AC-6b), with an optional note. */
const openCard = (
  ctx: CardContext,
  live: LiveRun,
  note?: string,
): readonly ServerPart[] => {
  const answers = answersFromRows(live.tool, live.rows);
  const question = openQuestion(
    live.tool,
    answers,
    latestShownQuestion(ctx.recent, live.run.id),
  );
  return question === null
    ? []
    : [questionPart(live.tool, live.run.id, answers, question, note)];
};

const COMPLETE_RETRY = (runId: string): ServerPart => ({
  type: "data-error",
  data: { kind: "complete_retry", retry: true, runId },
});

/**
 * Completion (AC-7): score from the stored answers and complete, once more on
 * `answers_changed`, then the view report card. A second failure shows the
 * `complete_retry` card, whose button sends `data-retry`.
 */
const completeRun = async (
  ctx: CardContext,
  owner: Owner,
  live: Pick<LiveRun, "run" | "tool">,
  attemptsLeft = 2,
): Promise<readonly ServerPart[]> => {
  const { deps } = ctx;
  const runId = live.run.id;
  const read = await deps.getRun(owner.current, runId);
  if (!read.ok) return [{ type: "text", text: CARD_REPLIES.noActiveRun }];

  const report: ServerPart = {
    type: "data-report",
    data: { runId, toolId: live.tool.id, toolName: live.tool.name },
  };
  if (read.value.run.status === "completed") return [report];

  const scored = scoreRun(live.tool, read.value.answers);
  if (!scored.ok) {
    // A missing answer (another tab hid or cleared one): ask it instead.
    if (scored.error.code === "incomplete") {
      const answers = answersFromRows(live.tool, read.value.answers);
      const next = afterSave(live.tool, answers);
      if (next.kind === "card")
        return [questionPart(live.tool, runId, answers, next.question)];
    }
    deps.log("assistant_complete_failed", { runId, reason: scored.error.code });
    return [COMPLETE_RETRY(runId)];
  }

  const { result } = await asOwner(deps, ctx.conversationId, owner, (id) =>
    deps.complete(
      id,
      runId,
      scored.value.scores,
      scored.value.answerCount,
      scored.value.lastAnswerAt,
    ),
  );
  if (result.ok) return [report];
  switch (result.error.code) {
    case "answers_changed":
      return attemptsLeft > 1
        ? completeRun(ctx, owner, live, attemptsLeft - 1)
        : [COMPLETE_RETRY(runId)];
    case "not_found":
    case "not_in_progress":
      return [{ type: "text", text: CARD_REPLIES.noActiveRun }];
    default: {
      const unreachable: never = result.error;
      return unreachable;
    }
  }
};

/** A tapped answer (AC-6): validate, save, then the next card or completion. */
const handleAnswer = async (
  ctx: CardContext,
  data: AnswerData,
): Promise<readonly ServerPart[]> => {
  const live = liveRun(ctx, data.runId);
  if (!live.ok) return live.error;
  const { run, tool, rows } = live.value;
  const answers = answersFromRows(tool, rows);

  const decision = decideAnswer(tool, answers, data);
  if (decision.kind === "reject")
    return openCard(ctx, live.value, decision.note);

  const { owner, result } = await asOwner(
    ctx.deps,
    ctx.conversationId,
    ctx.owner,
    (id) =>
      ctx.deps.saveAnswer(
        id,
        run.id,
        decision.questionId,
        decision.value,
        "client",
      ),
  );
  if (!result.ok) return [{ type: "text", text: CARD_REPLIES.noActiveRun }];

  const after = { ...answers, [decision.questionId]: decision.value };
  const next = afterSave(tool, after);
  return next.kind === "card"
    ? [questionPart(tool, run.id, after, next.question)]
    : completeRun(ctx, owner, live.value);
};

/** A prefill card response (AC-5): save the accepted items, then the edit or next card. */
const handlePrefill = async (
  ctx: CardContext,
  data: PrefillResponseData,
): Promise<readonly ServerPart[]> => {
  const live = liveRun(ctx, data.runId);
  if (!live.ok) return live.error;
  const { run, tool, rows } = live.value;
  const answers = answersFromRows(tool, rows);
  const decision = decidePrefill(
    tool,
    answers,
    latestPrefill(ctx.recent, run.id),
    data,
  );

  const saved: { owner: Owner; answers: typeof answers } = {
    owner: ctx.owner,
    answers,
  };
  for (const item of decision.saves) {
    const { owner, result } = await asOwner(
      ctx.deps,
      ctx.conversationId,
      saved.owner,
      (id) =>
        ctx.deps.saveAnswer(id, run.id, item.questionId, item.value, "chat"),
    );
    if (!result.ok) return [{ type: "text", text: CARD_REPLIES.noActiveRun }];
    saved.owner = owner;
    saved.answers = { ...saved.answers, [item.questionId]: item.value };
  }

  const edited =
    decision.edit === null
      ? undefined
      : tool.questions.find((q) => q.id === decision.edit);
  if (edited) return [questionPart(tool, run.id, saved.answers, edited)];
  const next = afterSave(tool, saved.answers);
  return next.kind === "card"
    ? [questionPart(tool, run.id, saved.answers, next.question)]
    : completeRun(ctx, saved.owner, live.value);
};

/** The `complete_retry` button (AC-7): run completion again for the active run. */
const handleRetry = async (
  ctx: CardContext,
  runId: string,
): Promise<readonly ServerPart[]> => {
  const live = liveRun(ctx, runId);
  if (!live.ok) return live.error;
  return completeRun(ctx, ctx.owner, live.value);
};

// ---------------------------------------------------------------------------
// handleTurn
// ---------------------------------------------------------------------------

/**
 * One chat turn (AC-1). Owner, then lock, then the user message save, so a `busy` turn
 * writes nothing. Card turns are never metered; typed turns are, unless a run was in
 * progress when the turn started; approval continuations never are.
 */
export const handleTurn = async (
  deps: TurnDeps,
  input: TurnInput,
): Promise<Result<TurnOutput, TurnError>> => {
  const started = deps.now();
  const classified = classifyMessage(input.message);
  if (!classified.ok) return classified;
  const { message, turn } = classified.value;
  const { conversationId } = input;

  const ownerId =
    input.context?.ownerId ??
    (await deps.ownerOf(conversationId).then((r) => (r.ok ? r.value : null)));
  if (ownerId === null || ownerId !== input.userId)
    return err({ code: "not_found" });

  const token = deps.newId();
  if (!(await deps.lock.acquire(conversationId, token))) {
    deps.log("assistant_turn", { path: "busy", conversationId });
    return ok({ stream: partsStream([BUSY], deps.newId), metered: false });
  }
  const release = () => deps.lock.release(conversationId, token);

  try {
    const saved = await asOwner(
      deps,
      conversationId,
      { current: ownerId },
      (id) =>
        deps.appendMessage(id, conversationId, {
          id: message.id,
          role: "user",
          parts: message.parts,
        }),
    );
    if (!saved.result.ok) {
      await release();
      return err({ code: "not_found" });
    }
    const owner = saved.owner;

    if (turn.kind === "text" || turn.kind === "approval") {
      const active =
        input.context?.active ??
        (await deps.getActive(owner.current, conversationId));
      const metered =
        turn.kind === "text" && active.active?.run.status !== "in_progress";
      const stream = await deps.aiTurn({
        ownerId: owner.current,
        conversationId,
        message,
        active,
        turn,
      });
      deps.log("assistant_turn", {
        path: "ai",
        conversationId,
        ms: deps.now() - started,
      });
      return ok({ stream: whenDone(stream, release), metered });
    }

    const [active, recent] = await Promise.all([
      input.context?.active ?? deps.getActive(owner.current, conversationId),
      deps.recentMessages(owner.current, conversationId),
    ]);
    const ctx: CardContext = { deps, conversationId, owner, active, recent };
    const parts = await (() => {
      switch (turn.kind) {
        case "answer":
          return handleAnswer(ctx, turn.data);
        case "prefill_response":
          return handlePrefill(ctx, turn.data);
        case "retry":
          return handleRetry(ctx, turn.data.runId);
        default: {
          const unreachable: never = turn;
          return unreachable;
        }
      }
    })();
    await release();
    deps.log("assistant_turn", {
      path: "card",
      conversationId,
      ms: deps.now() - started,
    });
    return ok({ stream: partsStream(parts, deps.newId), metered: false });
  } catch (e) {
    await release();
    throw e;
  }
};
