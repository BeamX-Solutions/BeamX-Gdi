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
import { err, ok, type Result } from "@/lib/result";
import type { TurnLock } from "@/lib/turn-lock";
import type { StoredAnswer, ToolModule, UnknownTool } from "@/tools/registry";
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
  asOwner,
  completeRun,
  type NotFound,
  type Owner,
  type StepDeps,
  type TurnRun,
} from "./card-steps";
import {
  classifyMessage,
  type AnswerSource,
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

export type { TurnRun } from "./card-steps";

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
  /** Free chat messages left today, when #7's route knows it (spec 0004). */
  readonly freeMessagesLeft?: number;
  /** A guest, for the run limits at Approve (spec 0008). */
  readonly isGuest: boolean;
  /** The client IP for the IP run limit, or null when unknown. */
  readonly ip: string | null;
  readonly turn:
    | { readonly kind: "text"; readonly text: string }
    | {
        readonly kind: "approval";
        readonly responses: readonly ApprovalResponse[];
      };
};

export type TurnDeps = StepDeps & {
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
  readonly saveAnswer: (
    ownerId: string,
    runId: string,
    questionId: string,
    value: unknown,
    source: AnswerSource,
  ) => Promise<
    Result<unknown, { readonly code: "not_found_or_not_in_progress" }>
  >;
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  /** The AI turn (build plan task 3). Returns the model's UI message stream and usage. */
  readonly aiTurn: (context: AiTurnContext) => Promise<AiTurnResult>;
  readonly newId: () => string;
  readonly now: () => number;
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
    readonly freeMessagesLeft?: number;
    /** A guest, read once by the route (spec 0008); false when not given. */
    readonly isGuest?: boolean;
    /** The client IP, or null when unknown or not given. */
    readonly ip?: string | null;
  };
};

/**
 * The token totals of one AI turn (spec 0007, step 6): `model` is the model that answered
 * the last step, so a provider fallback is priced as the model that ran.
 */
export type ChatUsage = {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
};

export type AiTurnResult = {
  readonly stream: ReadableStream<UIMessageChunk>;
  /**
   * Settles once the turn ends (finish, approval request, error, cancel) to the totals of
   * the steps that ran, or null when no step reported usage. Never rejects.
   */
  readonly usage: Promise<ChatUsage | null>;
  /**
   * Settles with the usage: true when the AI call failed (no finish, or the turn could
   * not open), so a paid turn charges nothing (spec 0004, AC-10). Never rejects.
   */
  readonly failed: Promise<boolean>;
};

export type TurnOutput = {
  readonly stream: ReadableStream<UIMessageChunk>;
  /** Whether this turn counts toward paid chat (spec 0004, AC-9). */
  readonly metered: boolean;
  /** The lock was taken by another turn: the stream is the `busy` notice, saved nowhere. */
  readonly busy: boolean;
  /** The AI turn's token totals; null for card and busy turns. Never rejects. */
  readonly usage: Promise<ChatUsage | null>;
  /** Whether the AI call failed; false for card and busy turns. Never rejects. */
  readonly failed: Promise<boolean>;
  /**
   * Frees the turn lock. The route calls it after saving the reply (spec 0007), so the
   * lock covers the whole turn. Idempotent and never throws; a no op on a busy turn.
   */
  readonly release: () => Promise<void>;
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

/** Wraps `run` so only the first call does anything, and no call ever throws. */
export const once = (run: () => Promise<void>): (() => Promise<void>) => {
  const state: { done: Promise<void> | null } = { done: null };
  return () => {
    state.done ??= run().catch(() => {});
    return state.done;
  };
};

const NO_USAGE: Promise<ChatUsage | null> = Promise.resolve(null);
const NOT_FAILED: Promise<boolean> = Promise.resolve(false);

const BUSY: ServerPart = {
  type: "data-error",
  data: { kind: "busy", retry: false },
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
    : completeRun(ctx.deps, ctx.conversationId, owner, live.value);
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
        ctx.deps.saveAnswer(
          id,
          run.id,
          item.questionId,
          item.value,
          item.source,
        ),
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
    : completeRun(ctx.deps, ctx.conversationId, saved.owner, live.value);
};

/** The `complete_retry` button (AC-7): run completion again for the active run. */
const handleRetry = async (
  ctx: CardContext,
  runId: string,
): Promise<readonly ServerPart[]> => {
  const live = liveRun(ctx, runId);
  if (!live.ok) return live.error;
  return completeRun(ctx.deps, ctx.conversationId, ctx.owner, live.value);
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
    return ok({
      stream: partsStream([BUSY], deps.newId),
      metered: false,
      busy: true,
      usage: NO_USAGE,
      failed: NOT_FAILED,
      release: async () => {},
    });
  }
  // From here the lock is held. Every path that returns a stream hands `release` to the
  // caller, which frees it after saving the reply; every other path frees it here.
  const release = once(() => deps.lock.release(conversationId, token));

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
    // Zero rows: the id belongs to a message of another role or chat, so nothing was
    // saved and the turn must not run on a message history lacks.
    if (saved.result.value === 0) {
      await release();
      return err({ code: "invalid_message" });
    }
    const owner = saved.owner;

    if (turn.kind === "text" || turn.kind === "approval") {
      const active =
        input.context?.active ??
        (await deps.getActive(owner.current, conversationId));
      const metered =
        turn.kind === "text" && active.active?.run.status !== "in_progress";
      const { stream, usage, failed } = await deps.aiTurn({
        ownerId: owner.current,
        conversationId,
        message,
        active,
        ...(input.context?.freeMessagesLeft === undefined
          ? {}
          : { freeMessagesLeft: input.context.freeMessagesLeft }),
        isGuest: input.context?.isGuest ?? false,
        ip: input.context?.ip ?? null,
        turn,
      });
      deps.log("assistant_turn", {
        path: "ai",
        conversationId,
        ms: deps.now() - started,
      });
      return ok({ stream, metered, busy: false, usage, failed, release });
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
    deps.log("assistant_turn", {
      path: "card",
      conversationId,
      ms: deps.now() - started,
    });
    // The lock stays held until the route has saved the reply, so a repeated tap sent
    // before then gets `busy` and can't complete a run twice (spec 0007, AC-2).
    return ok({
      stream: partsStream(parts, deps.newId),
      metered: false,
      busy: false,
      usage: NO_USAGE,
      failed: NOT_FAILED,
      release,
    });
  } catch (e) {
    await release();
    throw e;
  }
};
