/**
 * The chat route's logic (spec 0007, "POST /api/chat flow", steps 3 to 7). The route
 * checks BotID and the session, then calls `postChat`. Every side effect comes through
 * `deps`, so tests run it with fakes.
 *
 * One writer per turn: the reply is saved once, in the outer stream's `onEnd`, and only
 * then is the turn lock released, so a tap sent again before the save gets `busy`.
 *
 * Limits (AC-8, and spec 0008's abuse limits) are checked before the turn: a notice
 * stream, never saved, with no lock and no AI call. A turn's stream is resumable (AC-6): the route buffers a copy under the
 * assistant message id, and `onEnd` forgets it once the reply is saved.
 */
import { createUIMessageStream, type UIMessageChunk } from "ai";
import { z } from "zod";
import type { TurnContext, TurnContextError } from "@/db/queries/conversations";
import type { NewMessage } from "@/db/queries/messages";
import type { UsageInput } from "@/db/queries/usage";
import { costUsd } from "@/lib/ai-cost";
import type { ChatGuard } from "@/lib/limits";
import { ok, type Result } from "@/lib/result";
import type { SpendCapError } from "@/lib/spend-cap";
import { classifyMessage, type TurnKind } from "./parts";
import type { ChatUsage, TurnError, TurnInput, TurnOutput } from "./turn";

export type ChatApiDeps = {
  readonly turnContext: (
    userId: string,
    conversationId: string,
    messageId: string,
    /** False for a guest at the daily new chat limit (spec 0008, AC-6). */
    mayCreate: boolean,
  ) => Promise<Result<TurnContext, TurnContextError>>;
  readonly handleTurn: (
    input: TurnInput,
  ) => Promise<Result<TurnOutput, TurnError>>;
  /** The chat's owner at write time (a guest may link mid stream). */
  readonly ownerOf: (
    conversationId: string,
  ) => Promise<Result<string, { readonly code: "not_found" }>>;
  readonly appendMessage: (
    ownerId: string,
    conversationId: string,
    message: NewMessage,
  ) => Promise<Result<number, { readonly code: "not_found" }>>;
  readonly recordUsage: (input: UsageInput) => Promise<unknown>;
  /** The daily AI spend cap for guests (spec 0008, AC-2). Allows on a Redis error. */
  readonly guestSpendCap: () => Promise<Result<void, SpendCapError>>;
  /** Forgets the chat's resumable stream once its reply is saved. Never throws. */
  readonly finishStream: (
    conversationId: string,
    streamId: string,
  ) => Promise<void>;
  /** The burst windows and a guest's daily chat counts (spec 0008). Never throw. */
  readonly guards: ChatGuard;
  /**
   * `MAX_MESSAGE_CHARS` and `RATE_LIMIT_MESSAGES_PER_RUN` (spec 0007, AC-8), plus
   * `LIMIT_CHAT_PER_GUEST` and `LIMIT_CHATS_PER_GUEST` (spec 0008).
   */
  readonly limits: {
    readonly maxChars: number;
    readonly perRun: number;
    readonly chatPerGuest: number;
    readonly chatsPerGuest: number;
  };
  /** Keeps work alive after the response ends (Next's `after`). */
  readonly waitUntil: (task: Promise<unknown>) => void;
  readonly newId: () => string;
  readonly log: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

export type ChatResponse =
  | { readonly kind: "json"; readonly status: number; readonly body: unknown }
  | {
      readonly kind: "stream";
      readonly stream: ReadableStream<UIMessageChunk>;
      /** Set when the route should buffer the stream for resuming; null for notices. */
      readonly resumable: {
        readonly conversationId: string;
        readonly streamId: string;
      } | null;
    };

const bodySchema = z.object({
  conversationId: z.uuid(),
  message: z.unknown(),
});

const json = (status: number, code: string): ChatResponse => ({
  kind: "json",
  status,
  body: { code },
});

/**
 * Passes `stream` through and calls `onAbort` if it fails or is cancelled. A clean end
 * calls nothing: then `onEnd` saves the reply and releases the lock itself.
 */
export const onAbort = (
  stream: ReadableStream<UIMessageChunk>,
  abort: () => Promise<void>,
): ReadableStream<UIMessageChunk> => {
  const reader = stream.getReader();
  return new ReadableStream<UIMessageChunk>({
    pull: async (controller) => {
      try {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (e) {
        await abort();
        controller.error(e);
      }
    },
    cancel: async (reason) => {
      await abort();
      await reader.cancel(reason);
    },
  });
};

/** The notices sent instead of a turn: shown, never saved. */
export type NoticeKind =
  | "limit_text"
  | "limit_run"
  | "answered"
  | "spend_cap"
  | "slow_down"
  | "chat_daily"
  | "chats_daily";

/**
 * A limit notice (step 5): one assistant message holding a `data-error` part. It is not
 * saved, takes no lock and makes no AI call.
 */
export const noticeStream = (
  id: string,
  kind: NoticeKind,
): ReadableStream<UIMessageChunk> =>
  createUIMessageStream({
    generateId: () => id,
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: id });
      writer.write({ type: "data-error", data: { kind, retry: false } });
      writer.write({ type: "finish" });
    },
  });

/**
 * Which limit a typed message hits, if any (AC-8). Only typed text counts: card taps,
 * approvals and retries pass. `typedInRun` counts typed messages already saved in the
 * active run, so the one that would make it `perRun + 1` is refused.
 */
export const limitHit = (
  turn: TurnKind,
  typedInRun: number,
  limits: Pick<ChatApiDeps["limits"], "maxChars" | "perRun">,
): "limit_text" | "limit_run" | null => {
  if (turn.kind !== "text") return null;
  if (turn.text.length > limits.maxChars) return "limit_text";
  if (typedInRun >= limits.perRun) return "limit_run";
  return null;
};

/** Appends the `finish` chunk the inner streams leave out, once they end cleanly. */
const withFinish = (
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> =>
  stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      flush: (controller) => {
        controller.enqueue({ type: "finish" });
      },
    }),
  );

/** Records the AI turn's `ai_usage` row once its usage settles (step 7.3). */
const recordChatUsage = async (
  deps: ChatApiDeps,
  conversationId: string,
  callKey: string,
  usage: Promise<ChatUsage | null>,
): Promise<void> => {
  try {
    const totals = await usage;
    if (totals === null) return;
    const owner = await deps.ownerOf(conversationId);
    const cost = costUsd(totals.model, totals);
    // A model with no price is recorded at cost 0, never skipped.
    if (!cost.ok)
      deps.log("ai_cost_unknown_model", { model: totals.model, callKey });
    await deps.recordUsage({
      callKey,
      ...(owner.ok ? { userId: owner.value } : {}),
      conversationId,
      purpose: "chat",
      model: totals.model,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      costUsd: cost.ok ? cost.value : 0,
    });
  } catch {
    deps.log("chat_usage_record_failed", { conversationId, callKey });
  }
};

/** Saves the single assistant message of the turn (step 7.1). Never throws. */
const saveReply = async (
  deps: ChatApiDeps,
  conversationId: string,
  message: { readonly id: string; readonly parts: readonly unknown[] },
): Promise<void> => {
  if (message.parts.length === 0) {
    deps.log("chat_reply_empty", { conversationId, messageId: message.id });
    return;
  }
  try {
    const owner = await deps.ownerOf(conversationId);
    if (!owner.ok) {
      deps.log("chat_reply_no_owner", { conversationId });
      return;
    }
    const saved = await deps.appendMessage(owner.value, conversationId, {
      id: message.id,
      role: "assistant",
      parts: message.parts,
    });
    if (!saved.ok || saved.value === 0)
      deps.log("chat_reply_not_saved", {
        conversationId,
        messageId: message.id,
      });
  } catch {
    deps.log("chat_reply_save_failed", {
      conversationId,
      messageId: message.id,
    });
  }
};

/**
 * One chat request for the session user. Expected failures are typed JSON (`400`,
 * `404`); everything else is a UI message stream holding exactly one assistant message.
 */
export const postChat = async (
  deps: ChatApiDeps,
  input: {
    readonly userId: string;
    /** A guest (anonymous session), read once by the route (spec 0008). */
    readonly isGuest: boolean;
    /** The client IP for the IP limits, or null when unknown (spec 0008). */
    readonly ip: string | null;
    readonly body: unknown;
  },
): Promise<ChatResponse> => {
  const notice = (
    kind: NoticeKind,
    fields: Readonly<Record<string, string | null>>,
  ): ChatResponse => {
    deps.log("chat_limit", { ...fields, limit: kind });
    return {
      kind: "stream",
      stream: noticeStream(deps.newId(), kind),
      resumable: null,
    };
  };

  // The burst windows first (spec 0008, AC-7): Redis only, before the body is parsed.
  // Guests and signed in users alike.
  if (!(await deps.guards.burst(input.userId, input.ip)))
    return notice("slow_down", { conversationId: null });

  const body = bodySchema.safeParse(input.body);
  if (!body.success) return json(400, "invalid_request");
  // Checked before anything is written, so a bad message never creates a chat.
  const classified = classifyMessage(body.data.message);
  if (!classified.ok) return json(400, "invalid_message");
  const { conversationId, message } = body.data;
  const typed = input.isGuest && classified.value.turn.kind === "text";

  // A guest's daily counts, and for a typed message the spend cap, read in parallel
  // before the DB round trip (spec 0008). Signed in users skip both.
  const [counts, cap] = await Promise.all([
    input.isGuest ? deps.guards.dailyCounts(input.userId) : null,
    typed ? deps.guestSpendCap() : ok(undefined),
  ]);
  // Same rule as `overLimit`: with a limit of 20, a count of 20 refuses the 21st.
  const mayCreate = counts === null || counts.chats < deps.limits.chatsPerGuest;

  const context = await deps.turnContext(
    input.userId,
    conversationId,
    classified.value.message.id,
    mayCreate,
  );
  // A new chat the guest may not create today (AC-6): nothing was written.
  if (!context.ok && context.error.code === "chat_limit")
    return notice("chats_daily", { conversationId });
  if (!context.ok) return json(404, "not_found");
  // Counted once the row exists, whatever happens to the turn (AC-6).
  if (input.isGuest && context.value.created)
    deps.waitUntil(deps.guards.countChats(input.userId));

  // Made once, up front: a retried `onEnd` keeps the same id and `callKey`.
  const assistantId = deps.newId();

  // A resend of a message that already has a saved reply: no second AI turn and no
  // duplicate reply. The notice is never saved; the client reloads the saved thread.
  if (context.value.message.answered) {
    deps.log("chat_already_answered", { conversationId });
    return {
      kind: "stream",
      stream: noticeStream(assistantId, "answered"),
      resumable: null,
    };
  }

  const runInProgress =
    context.value.active.active?.run.status === "in_progress";
  // Only a guest's new typed message (a resend passed these when it came in).
  const guestTyped = typed && !context.value.message.saved;
  // The spend cap (spec 0008, AC-2). Taps, card answers and resends go through;
  // signed in users are never paused.
  if (guestTyped && !cap.ok) return notice("spend_cap", { conversationId });
  // The daily chat limit (AC-5): typed messages with no run in progress.
  if (
    guestTyped &&
    !runInProgress &&
    counts !== null &&
    counts.chat >= deps.limits.chatPerGuest
  )
    return notice("chat_daily", { conversationId });

  // Step 5: limits before the turn. Shown, never saved, no lock, no AI call. A resend
  // of a saved message passed the limit when it came in, so it is not counted again.
  const limit = context.value.message.saved
    ? null
    : limitHit(classified.value.turn, context.value.typedInRun, deps.limits);
  if (limit !== null) {
    deps.log("chat_limit", { conversationId, limit });
    return {
      kind: "stream",
      stream: noticeStream(assistantId, limit),
      resumable: null,
    };
  }

  const turn = await deps.handleTurn({
    userId: input.userId,
    conversationId,
    message,
    context: {
      ownerId: input.userId,
      active: context.value.active,
      isGuest: input.isGuest,
      ip: input.ip,
    },
  });
  if (!turn.ok)
    return turn.error.code === "not_found"
      ? json(404, "not_found")
      : json(400, "invalid_message");

  const { stream: inner, busy, metered, usage, release } = turn.value;
  try {
    if (metered)
      deps.log("chat_metered", { conversationId, messageId: assistantId });
    // The turn ran on a new typed message with no run in progress: count it (AC-5).
    if (guestTyped && metered && !busy)
      deps.waitUntil(deps.guards.countChat(input.userId));
    const stream = createUIMessageStream({
      generateId: () => assistantId,
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: assistantId });
        writer.merge(withFinish(onAbort(inner, release)));
      },
      onEnd: async ({ responseMessage }) => {
        // A busy notice is shown, never saved (AC-2).
        if (!busy) {
          await saveReply(deps, conversationId, {
            id: assistantId,
            parts: responseMessage.parts,
          });
          // Saved, so a reload now reads the reply from the DB, not the stream.
          await deps.finishStream(conversationId, assistantId);
        }
        await release();
        deps.waitUntil(
          recordChatUsage(deps, conversationId, `${assistantId}:chat`, usage),
        );
      },
    });
    // A busy turn must not replace the running turn's resumable stream.
    return {
      kind: "stream",
      stream,
      resumable: busy ? null : { conversationId, streamId: assistantId },
    };
  } catch (e) {
    await release();
    throw e;
  }
};
