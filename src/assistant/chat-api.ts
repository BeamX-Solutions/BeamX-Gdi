/**
 * The chat route's logic (spec 0007, "POST /api/chat flow", steps 3 to 7). The route
 * checks BotID and the session, then calls `postChat`. Every side effect comes through
 * `deps`, so tests run it with fakes.
 *
 * One writer per turn: the reply is saved once, in the outer stream's `onEnd`, and only
 * then is the turn lock released, so a tap sent again before the save gets `busy`.
 *
 * Limits (AC-8) are checked before the turn: a notice stream, never saved, with no lock
 * and no AI call. A turn's stream is resumable (AC-6): the route buffers a copy under the
 * assistant message id, and `onEnd` forgets it once the reply is saved.
 */
import { createUIMessageStream, type UIMessageChunk } from "ai";
import { z } from "zod";
import type { TurnContext } from "@/db/queries/conversations";
import type { NewMessage } from "@/db/queries/messages";
import type { UsageInput } from "@/db/queries/usage";
import { costUsd } from "@/lib/ai-cost";
import type { Result } from "@/lib/result";
import { classifyMessage, type TurnKind } from "./parts";
import type { ChatUsage, TurnError, TurnInput, TurnOutput } from "./turn";

export type ChatApiDeps = {
  readonly turnContext: (
    userId: string,
    conversationId: string,
    messageId: string,
  ) => Promise<Result<TurnContext, { readonly code: "other_owner" }>>;
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
  /** Forgets the chat's resumable stream once its reply is saved. Never throws. */
  readonly finishStream: (
    conversationId: string,
    streamId: string,
  ) => Promise<void>;
  /** `MAX_MESSAGE_CHARS` and `RATE_LIMIT_MESSAGES_PER_RUN` (spec 0007, AC-8). */
  readonly limits: { readonly maxChars: number; readonly perRun: number };
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

/**
 * A limit notice (step 5): one assistant message holding a `data-error` part. It is not
 * saved, takes no lock and makes no AI call.
 */
export const noticeStream = (
  id: string,
  kind: "limit_text" | "limit_run" | "answered",
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
  limits: ChatApiDeps["limits"],
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
  input: { readonly userId: string; readonly body: unknown },
): Promise<ChatResponse> => {
  const body = bodySchema.safeParse(input.body);
  if (!body.success) return json(400, "invalid_request");
  // Checked before anything is written, so a bad message never creates a chat.
  const classified = classifyMessage(body.data.message);
  if (!classified.ok) return json(400, "invalid_message");
  const { conversationId, message } = body.data;

  const context = await deps.turnContext(
    input.userId,
    conversationId,
    classified.value.message.id,
  );
  if (!context.ok) return json(404, "not_found");

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
    context: { ownerId: input.userId, active: context.value.active },
  });
  if (!turn.ok)
    return turn.error.code === "not_found"
      ? json(404, "not_found")
      : json(400, "invalid_message");

  const { stream: inner, busy, metered, usage, release } = turn.value;
  try {
    if (metered)
      deps.log("chat_metered", { conversationId, messageId: assistantId });
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
