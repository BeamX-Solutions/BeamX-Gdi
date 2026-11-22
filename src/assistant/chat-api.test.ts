import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { billingConfig } from "@/billing/config";
import type { TurnContext } from "@/db/queries/conversations";
import type { NewMessage } from "@/db/queries/messages";
import type { UsageInput } from "@/db/queries/usage";
import type { BurstWindow } from "@/lib/limits";
import { err, ok } from "@/lib/result";
import { makeRegistry } from "@/tools/_kit/registry";
import { sampleTool } from "@/tools/test-tools/sample";
import {
  burstWindow,
  limitHit,
  postChat,
  type ChatApiDeps,
  type ChatResponse,
} from "./chat-api";
import { classifyMessage } from "./parts";
import {
  handleTurn,
  type ChatUsage,
  type TurnDeps,
  type TurnOutput,
} from "./turn";

describe("burstWindow (spec 0008, AC-7, AC-12)", () => {
  const card = (type: string, data: unknown) =>
    classifyMessage({ id: MSG, role: "user", parts: [{ type, data }] });

  it("picks cards only for a well formed card tap", () => {
    expect(
      burstWindow(
        card("data-answer", {
          runId: "0190a000-0000-7000-8000-000000000b01",
          questionId: "q1",
          value: "a",
        }),
      ),
    ).toBe("cards");
    expect(
      burstWindow(
        card("data-retry", {
          runId: "0190a000-0000-7000-8000-000000000b01",
          action: "complete",
        }),
      ),
    ).toBe("cards");
  });

  it("uses the strict user window for typed messages, approvals and anything unparsable", () => {
    expect(burstWindow(classifyMessage(typed("hi")))).toBe("user");
    expect(
      burstWindow(
        classifyMessage({
          id: MSG,
          role: "user",
          parts: [
            {
              type: "tool-approval-response",
              approvalId: "a1",
              approved: true,
            },
          ],
        }),
      ),
    ).toBe("user");
    expect(burstWindow(null)).toBe("user");
    expect(burstWindow(classifyMessage("junk"))).toBe("user");
    // A card part mixed with text is refused by classifyMessage, so it stays strict.
    expect(
      burstWindow(
        classifyMessage({
          id: MSG,
          role: "user",
          parts: [
            { type: "text", text: "hi" },
            { type: "data-retry", data: { runId: "x" } },
          ],
        }),
      ),
    ).toBe("user");
  });
});

// Spec 0007, AC-2 and the POST /api/chat flow: `postChat` with fake deps, and with the
// real `handleTurn` over an in memory turn lock for the one writer per turn rules.

const USER = "0190a000-0000-7000-8000-000000000a01";
const OTHER = "0190a000-0000-7000-8000-000000000a02";
const CONV = "0190a000-0000-7000-8000-000000000c01";
const MSG = "0190a000-0000-7000-8000-000000000d01";
const MSG2 = "0190a000-0000-7000-8000-000000000d02";
const REPLY = "0190a000-0000-7000-8000-000000000e01";
const HOLD = "0190a000-0000-7000-8000-000000000f01";

const USAGE: ChatUsage = {
  model: "claude-opus-5-5",
  inputTokens: 1000,
  outputTokens: 100,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const typed = (text: string, id = MSG) => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const textStream = (text: string) =>
  new ReadableStream<UIMessageChunk>({
    start: (c) => {
      c.enqueue({ type: "text-start", id: "t" });
      c.enqueue({ type: "text-delta", id: "t", delta: text });
      c.enqueue({ type: "text-end", id: "t" });
      c.close();
    },
  });

const turnOutput = (over: Partial<TurnOutput> = {}): TurnOutput => ({
  stream: textStream("Hello"),
  metered: true,
  busy: false,
  usage: Promise.resolve(USAGE),
  failed: Promise.resolve(false),
  release: vi.fn(async () => {}),
  ...over,
});

const fakeDeps = (over: Partial<ChatApiDeps> = {}) => {
  const saved: { ownerId: string; message: NewMessage }[] = [];
  const usage: UsageInput[] = [];
  const pending: Promise<unknown>[] = [];
  const logs: string[] = [];
  const finished: string[] = [];
  const deps: ChatApiDeps = {
    turnContext: async () =>
      ok({
        active: { active: null, paused: [] },
        typedInRun: 0,
        message: { saved: false, answered: false },
        created: false,
      }),
    handleTurn: async () => ok(turnOutput()),
    ownerOf: async () => ok(USER),
    appendMessage: async (ownerId, _c, message) => {
      saved.push({ ownerId, message });
      return ok(1);
    },
    recordUsage: async (input) => {
      usage.push(input);
    },
    guestSpendCap: async () => ok(undefined),
    finishStream: async (_c, streamId) => {
      finished.push(streamId);
    },
    guards: {
      burst: async () => null,
      dailyCounts: async () => ({ chat: 0, chats: 0 }),
      countChat: async () => {},
      countChats: async () => {},
    },
    limits: { maxChars: 4000, perRun: 40, chatPerGuest: 30, chatsPerGuest: 20 },
    billing: {
      config: billingConfig,
      freeUsed: async () => 0,
      countFree: async () => {},
      noticeOnce: async () => false,
      openAccount: async () => ({ created: false, granted: 0 }),
      holdChat: async () => ok({ holdId: HOLD }),
      settleChat: async () => ({ available: 27, held: 0 }),
    },
    waitUntil: (task) => {
      pending.push(task);
    },
    newId: () => REPLY,
    log: (event) => {
      logs.push(event);
    },
    ...over,
  };
  return { deps, saved, usage, pending, logs, finished };
};

const readAll = async (response: ChatResponse) => {
  if (response.kind !== "stream") throw new Error("expected a stream");
  const chunks: UIMessageChunk[] = [];
  const reader = response.stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
};

describe("postChat: input and ownership (AC-2, AC-7)", () => {
  it("refuses a body without a uuid conversation id, before any read", async () => {
    const turnContext = vi.fn();
    const { deps } = fakeDeps({ turnContext });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: "nope", message: typed("hi") },
    });
    expect(result).toEqual({
      kind: "json",
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(turnContext).not.toHaveBeenCalled();
  });

  it("refuses an invalid message before the chat is created", async () => {
    const turnContext = vi.fn();
    const { deps } = fakeDeps({ turnContext });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: { id: MSG, role: "assistant" } },
    });
    expect(result).toMatchObject({ status: 400 });
    expect(turnContext).not.toHaveBeenCalled();
  });

  it("returns 404 with nothing run for another user's chat", async () => {
    const handle = vi.fn();
    const { deps } = fakeDeps({
      turnContext: async () => err({ code: "other_owner" }),
      handleTurn: handle,
    });
    const result = await postChat(deps, {
      userId: OTHER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("hi") },
    });
    expect(result).toMatchObject({ status: 404, body: { code: "not_found" } });
    expect(handle).not.toHaveBeenCalled();
  });

  it("passes the route's context to the turn, so it does not read again", async () => {
    const active = { active: null, paused: [] };
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({
      turnContext: async () =>
        ok({
          active,
          typedInRun: 0,
          message: { saved: false, answered: false },
          created: false,
        }),
      handleTurn: handle,
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: true,
        ip: "1.2.3.4",
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    // The guest flag and IP reach the tools for the run limits (spec 0008).
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          ownerId: USER,
          active,
          // A typed message with no run: the first of 5 free guest messages.
          freeMessagesLeft: 4,
          isGuest: true,
          ip: "1.2.3.4",
        },
      }),
    );
  });
});

describe("postChat: one writer per turn (AC-2)", () => {
  it("wraps the turn in one message and saves exactly one assistant message", async () => {
    const { deps, saved } = fakeDeps();
    const chunks = await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(chunks.at(0)).toEqual({ type: "start", messageId: REPLY });
    expect(chunks.at(-1)).toEqual({
      type: "finish",
      messageMetadata: { billing: { kind: "free", freeLeft: 9 } },
    });
    expect(saved).toEqual([
      {
        ownerId: USER,
        message: {
          id: REPLY,
          role: "assistant",
          parts: [expect.objectContaining({ type: "text", text: "Hello" })],
        },
      },
    ]);
  });

  it("saves the reply to the owner at write time (a guest linked mid stream)", async () => {
    const { deps, saved } = fakeDeps({ ownerOf: async () => ok(OTHER) });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(saved.map((s) => s.ownerId)).toEqual([OTHER]);
  });

  it("saves, then releases the lock, then records usage", async () => {
    const order: string[] = [];
    const { deps, pending } = fakeDeps({
      handleTurn: async () =>
        ok(
          turnOutput({
            release: async () => {
              order.push("release");
            },
          }),
        ),
      appendMessage: async () => {
        order.push("save");
        return ok(1);
      },
      recordUsage: async () => {
        order.push("usage");
      },
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    await Promise.all(pending);
    expect(order).toEqual(["save", "release", "usage"]);
  });

  it("never saves a busy notice, but still releases (a no op there)", async () => {
    const release = vi.fn(async () => {});
    const { deps, saved } = fakeDeps({
      handleTurn: async () =>
        ok(
          turnOutput({
            busy: true,
            usage: Promise.resolve(null),
            release,
          }),
        ),
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(saved).toEqual([]);
    expect(release).toHaveBeenCalled();
  });

  it("still releases the lock when the save fails", async () => {
    const release = vi.fn(async () => {});
    const { deps, logs } = fakeDeps({
      handleTurn: async () => ok(turnOutput({ release })),
      appendMessage: async () => {
        throw new Error("db down");
      },
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(release).toHaveBeenCalled();
    expect(logs).toContain("chat_reply_save_failed");
  });
});

describe("postChat: usage (spec 0007, step 7.3)", () => {
  it("records ai_usage once with the chat call key and the price", async () => {
    const { deps, usage, pending } = fakeDeps();
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    await Promise.all(pending);
    expect(usage).toEqual([
      {
        callKey: `${REPLY}:chat`,
        userId: USER,
        conversationId: CONV,
        purpose: "chat",
        model: "claude-opus-5-5",
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: "0.006000",
      },
    ]);
  });

  it("records an unpriced model at cost 0 and logs it, never skipping it", async () => {
    const { deps, usage, pending, logs } = fakeDeps({
      handleTurn: async () =>
        ok(
          turnOutput({
            usage: Promise.resolve({ ...USAGE, model: "mystery-model" }),
          }),
        ),
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    await Promise.all(pending);
    expect(usage.map((u) => u.costUsd)).toEqual([0]);
    expect(logs).toContain("ai_cost_unknown_model");
  });

  it("records nothing for a card turn (usage is null)", async () => {
    const { deps, usage, pending } = fakeDeps({
      handleTurn: async () =>
        ok(turnOutput({ usage: Promise.resolve(null), metered: false })),
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    await Promise.all(pending);
    expect(usage).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// With the real handleTurn and an in memory lock
// ---------------------------------------------------------------------------

const memoryLock = () => {
  const held = new Map<string, string>();
  return {
    held,
    acquire: async (c: string, t: string) => {
      if (held.has(c)) return false;
      held.set(c, t);
      return true;
    },
    release: async (c: string, t: string) => {
      if (held.get(c) === t) held.delete(c);
    },
  };
};

const deferred = <T = void>() => {
  const box: { resolve: (v: T) => void } = { resolve: () => {} };
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (v: T) => box.resolve(v) };
};

const registry = makeRegistry([sampleTool]);

const realTurnDeps = (
  lock: ReturnType<typeof memoryLock>,
  aiStream: () => ReadableStream<UIMessageChunk>,
): TurnDeps => {
  const ids = { n: 0 };
  return {
    ownerOf: async () => ok(USER),
    lock,
    appendMessage: async () => ok(1),
    getActive: async () => ({ active: null, paused: [] }),
    recentMessages: async () => [],
    getRun: async () => err({ code: "not_found" }),
    saveAnswer: async () => err({ code: "not_found_or_not_in_progress" }),
    complete: async () => ok({}),
    getTool: registry.getTool,
    aiTurn: async () => ({
      stream: aiStream(),
      usage: Promise.resolve(null),
      failed: Promise.resolve(false),
    }),
    newId: () => `tok-${++ids.n}`,
    now: () => 0,
    log: () => {},
  };
};

describe("postChat over handleTurn: the lock covers the save (AC-2)", () => {
  it("answers busy to a message sent again before the reply is saved, then frees the lock", async () => {
    const lock = memoryLock();
    const turn = realTurnDeps(lock, () => textStream("Hello"));
    const saveStarted = deferred();
    const saveDone = deferred<void>();
    const { deps, saved } = fakeDeps({
      handleTurn: (input) => handleTurn(turn, input),
      appendMessage: async (ownerId, _c, message) => {
        saveStarted.resolve();
        await saveDone.promise;
        saved.push({ ownerId, message });
        return ok(1);
      },
    });

    const first = readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    await saveStarted.promise;
    // The stream has ended but the reply is not saved yet: the lock is still held.
    expect(lock.held.has(CONV)).toBe(true);

    const second = await readAll(
      await postChat(
        { ...deps, newId: () => "0190a000-0000-7000-8000-000000000e02" },
        {
          userId: USER,
          isGuest: false,
          ip: null,
          body: { conversationId: CONV, message: typed("again", MSG2) },
        },
      ),
    );
    expect(second).toContainEqual({
      type: "data-error",
      data: { kind: "busy", retry: false },
    });

    saveDone.resolve();
    await first;
    expect(saved).toHaveLength(1);
    expect(lock.held.has(CONV)).toBe(false);
  });

  it("saves the partial reply and frees the lock when the response is cancelled", async () => {
    const lock = memoryLock();
    const turn = realTurnDeps(
      lock,
      () =>
        new ReadableStream<UIMessageChunk>({
          start: (c) => {
            c.enqueue({ type: "text-start", id: "t" });
            c.enqueue({ type: "text-delta", id: "t", delta: "Half a rep" });
            // Never closes: the client goes away mid reply.
          },
        }),
    );
    const { deps, saved } = fakeDeps({
      handleTurn: (input) => handleTurn(turn, input),
    });
    const response = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("hi") },
    });
    if (response.kind !== "stream") throw new Error("expected a stream");
    const reader = response.stream.getReader();
    // Read until the delta arrives, then cancel.
    for (;;) {
      const next = await reader.read();
      if (next.done || next.value.type === "text-delta") break;
    }
    await reader.cancel();

    await vi.waitFor(() => expect(lock.held.has(CONV)).toBe(false));
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.message.parts).toEqual([
      expect.objectContaining({ type: "text", text: "Half a rep" }),
    ]);
  });
});

/** A card answer tap: a card turn, which never calls the AI (spec 0008, AC-12). */
const cardAnswer = (id = MSG) => ({
  id,
  role: "user",
  parts: [
    {
      type: "data-answer",
      data: {
        runId: "0190a000-0000-7000-8000-000000000b01",
        questionId: "q1",
        value: "a",
      },
    },
  ],
});

const approvalTap = (id = MSG) => ({
  id,
  role: "user",
  parts: [{ type: "tool-approval-response", approvalId: "a1", approved: true }],
});

const inRun =
  (
    typedInRun: number,
    message: { saved: boolean; answered: boolean } = {
      saved: false,
      answered: false,
    },
  ) =>
  async () =>
    ok({
      active: { active: null, paused: [] },
      typedInRun,
      message,
      created: false,
    });

describe("postChat: limits (spec 0007, AC-8)", () => {
  it("refuses typed text over the limit with a notice, no turn and nothing saved", async () => {
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({ handleTurn: handle });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("a".repeat(4001)) },
    });
    expect(result).toMatchObject({ kind: "stream", resumable: null });
    expect(await readAll(result)).toEqual([
      { type: "start", messageId: REPLY },
      { type: "data-error", data: { kind: "limit_text", retry: false } },
      { type: "finish" },
    ]);
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("lets typed text of exactly the limit through", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({ handleTurn: handle });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("a".repeat(4000)) },
      }),
    );
    expect(handle).toHaveBeenCalledOnce();
  });

  it("refuses the 41st typed message in a run with a notice", async () => {
    const handle = vi.fn();
    const { deps } = fakeDeps({ handleTurn: handle, turnContext: inRun(40) });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("one more") },
    });
    expect(await readAll(result)).toContainEqual({
      type: "data-error",
      data: { kind: "limit_run", retry: false },
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("lets a retried 40th typed message through: it was counted when it came in", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({
      handleTurn: handle,
      // The 40th is already saved, so the count includes it.
      turnContext: inRun(40, { saved: true, answered: false }),
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("fortieth") },
      }),
    );
    expect(handle).toHaveBeenCalledOnce();
  });

  it("lets the 40th typed message through", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({ handleTurn: handle, turnContext: inRun(39) });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("fortieth") },
      }),
    );
    expect(handle).toHaveBeenCalledOnce();
  });

  it("never counts or refuses taps, even past the run limit", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({ handleTurn: handle, turnContext: inRun(99) });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: approvalTap() },
      }),
    );
    expect(handle).toHaveBeenCalledOnce();
  });

  it("limitHit checks length before the run count", () => {
    const limits = { maxChars: 10, perRun: 2 };
    expect(limitHit({ kind: "text", text: "x".repeat(11) }, 5, limits)).toBe(
      "limit_text",
    );
    expect(limitHit({ kind: "text", text: "ok" }, 2, limits)).toBe("limit_run");
    expect(limitHit({ kind: "text", text: "ok" }, 1, limits)).toBeNull();
  });
});

describe("postChat: resumable streams (spec 0007, AC-6)", () => {
  it("marks a turn's stream resumable under the reply id", async () => {
    const { deps } = fakeDeps();
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("hi") },
    });
    expect(result).toMatchObject({
      kind: "stream",
      resumable: { conversationId: CONV, streamId: REPLY },
    });
  });

  it("forgets the stream only after the reply is saved", async () => {
    const order: string[] = [];
    const { deps } = fakeDeps({
      appendMessage: async () => {
        order.push("save");
        return ok(1);
      },
      finishStream: async () => {
        order.push("finish");
      },
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: null,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(order).toEqual(["save", "finish"]);
  });

  it("never makes a busy turn resumable, so it can't replace the running one", async () => {
    const { deps, finished } = fakeDeps({
      handleTurn: async () => ok(turnOutput({ busy: true })),
    });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message: typed("hi") },
    });
    expect(result).toMatchObject({ resumable: null });
    await readAll(result);
    expect(finished).toEqual([]);
  });
});

describe("postChat: a resent message that already has a reply", () => {
  it("answers with the answered notice: no turn, nothing saved, not resumable", async () => {
    const handle = vi.fn();
    const turnContext = vi.fn(inRun(0, { saved: true, answered: true }));
    const { deps, saved } = fakeDeps({ handleTurn: handle, turnContext });
    const message = typed("what can you do?");
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: null,
      body: { conversationId: CONV, message },
    });
    expect(result.kind === "stream" && result.resumable).toBe(null);
    expect(await readAll(result)).toContainEqual({
      type: "data-error",
      data: { kind: "answered", retry: false },
    });
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    // The route asks about this exact message id.
    expect(turnContext).toHaveBeenCalledWith(USER, CONV, message.id, true);
  });
});

describe("postChat: the guest spend cap (spec 0008, AC-2)", () => {
  const capped = async () => err({ code: "spend_cap" as const });

  const send = (deps: ChatApiDeps, message: unknown, isGuest = true) =>
    postChat(deps, {
      userId: USER,
      isGuest,
      ip: "102.89.1.2",
      body: { conversationId: CONV, message },
    });

  it("gives a guest's typed message the spend_cap notice, with no turn and nothing saved", async () => {
    const handle = vi.fn();
    const { deps, saved, logs } = fakeDeps({
      handleTurn: handle,
      guestSpendCap: capped,
    });
    const chunks = await readAll(await send(deps, typed("hello")));
    expect(chunks).toContainEqual({
      type: "data-error",
      data: { kind: "spend_cap", retry: false },
    });
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(logs).toContain("chat_limit");
  });

  it("lets a guest's tap through: a run already started keeps going", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const cap = vi.fn(capped);
    const { deps } = fakeDeps({ handleTurn: handle, guestSpendCap: cap });
    await readAll(await send(deps, approvalTap()));
    expect(handle).toHaveBeenCalledOnce();
    expect(cap).not.toHaveBeenCalled();
  });

  it("never pauses a signed in user", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const cap = vi.fn(capped);
    const { deps } = fakeDeps({ handleTurn: handle, guestSpendCap: cap });
    await readAll(await send(deps, typed("hello"), false));
    expect(handle).toHaveBeenCalledOnce();
    expect(cap).not.toHaveBeenCalled();
  });

  it("lets a resend of a saved message through: it passed when it came in", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({
      handleTurn: handle,
      // Read in parallel with the daily counts, but not applied to a resend.
      guestSpendCap: capped,
      turnContext: inRun(0, { saved: true, answered: false }),
    });
    await readAll(await send(deps, typed("hello")));
    expect(handle).toHaveBeenCalledOnce();
  });

  it("lets a guest's typed message through below the cap", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({ handleTurn: handle });
    await readAll(await send(deps, typed("hello")));
    expect(handle).toHaveBeenCalledOnce();
  });
});

describe("postChat: abuse limits at chat (spec 0008, AC-5, AC-6, AC-7)", () => {
  const IP = "102.89.1.2";
  const send = (deps: ChatApiDeps, message: unknown, isGuest = true) =>
    postChat(deps, {
      userId: USER,
      isGuest,
      ip: IP,
      body: { conversationId: CONV, message },
    });

  /** Guards that record what was counted, with the counts a test sets. */
  const guards = (
    over: Partial<{
      refuse: BurstWindow;
      chat: number;
      chats: number;
    }> = {},
  ) => {
    const calls = {
      burst: [] as [string, string | null, string][],
      chat: 0,
      chats: 0,
      read: 0,
    };
    const value: ChatApiDeps["guards"] = {
      burst: async (userId, ip, window) => {
        calls.burst.push([userId, ip, window]);
        return over.refuse ?? null;
      },
      dailyCounts: async () => {
        calls.read += 1;
        return { chat: over.chat ?? 0, chats: over.chats ?? 0 };
      },
      countChat: async () => {
        calls.chat += 1;
      },
      countChats: async () => {
        calls.chats += 1;
      },
    };
    return { value, calls };
  };

  const kindOf = (chunks: readonly UIMessageChunk[]) =>
    chunks.flatMap((c) =>
      c.type === "data-error"
        ? [(c as { data: { kind: string } }).data.kind]
        : [],
    );

  const settle = (pending: readonly Promise<unknown>[]) => Promise.all(pending);

  it("over the burst window, sends slow_down before reading the body or the DB", async () => {
    const g = guards({ refuse: "user" });
    const turnContext = vi.fn();
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({
      guards: g.value,
      turnContext,
      handleTurn: handle,
    });
    const chunks = await readAll(
      await postChat(deps, {
        userId: USER,
        isGuest: false,
        ip: IP,
        body: "not even json",
      }),
    );
    expect(kindOf(chunks)).toEqual(["slow_down"]);
    // An unparsable body is checked against the strict user window (AC-7).
    expect(g.calls.burst).toEqual([[USER, IP, "user"]]);
    expect(turnContext).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("the burst limit applies to signed in users too", async () => {
    const g = guards({ refuse: "user" });
    const { deps } = fakeDeps({ guards: g.value });
    const chunks = await readAll(await send(deps, typed("hi"), false));
    expect(kindOf(chunks)).toEqual(["slow_down"]);
  });

  it("an unparsable body that fits the window still gets its 400 (AC-7)", async () => {
    const g = guards();
    const { deps } = fakeDeps({ guards: g.value });
    const result = await postChat(deps, {
      userId: USER,
      isGuest: false,
      ip: IP,
      body: "not even json",
    });
    expect(result).toMatchObject({ kind: "json", status: 400 });
    expect(g.calls.burst).toEqual([[USER, IP, "user"]]);
  });

  it("card taps use the cards window, typed messages and approvals the user window (AC-7, AC-12)", async () => {
    const g = guards();
    const { deps } = fakeDeps({ guards: g.value });
    await readAll(await send(deps, cardAnswer()));
    await readAll(await send(deps, typed("hi", MSG2)));
    await readAll(await send(deps, approvalTap(MSG2)));
    expect(g.calls.burst.map(([, , window]) => window)).toEqual([
      "cards",
      "user",
      "user",
    ]);
  });

  it("a card tap over its window gets slow_down and logs the refusing window (AC-12)", async () => {
    const g = guards({ refuse: "cards" });
    const handle = vi.fn();
    const logs: [string, unknown][] = [];
    const { deps, saved } = fakeDeps({
      guards: g.value,
      handleTurn: handle,
      log: (event, fields) => {
        logs.push([event, fields]);
      },
    });
    const chunks = await readAll(await send(deps, cardAnswer()));
    expect(kindOf(chunks)).toEqual(["slow_down"]);
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(logs).toContainEqual([
      "chat_limit",
      { conversationId: null, window: "cards", limit: "slow_down" },
    ]);
  });

  it("only a typed message may create a chat; a card or approval to an unknown chat is a 404 (AC-12)", async () => {
    for (const isGuest of [true, false]) {
      const turnContext = vi.fn(async () =>
        err({ code: "chat_limit" as const }),
      );
      const { deps } = fakeDeps({ guards: guards().value, turnContext });
      for (const message of [cardAnswer(), approvalTap()]) {
        const result = await send(deps, message, isGuest);
        expect(result).toMatchObject({ kind: "json", status: 404 });
      }
      expect(turnContext.mock.calls.map((c) => c.at(3))).toEqual([
        false,
        false,
      ]);
    }
  });

  it("refuses a guest's 31st typed message with no run, without a turn", async () => {
    const g = guards({ chat: 30 });
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({ guards: g.value, handleTurn: handle });
    const chunks = await readAll(await send(deps, typed("hi")));
    expect(kindOf(chunks)).toEqual(["chat_daily"]);
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("counts a guest's typed message only once its turn ran", async () => {
    const g = guards({ chat: 29 });
    const { deps, pending } = fakeDeps({
      guards: g.value,
      handleTurn: async () => ok(turnOutput({ metered: true })),
    });
    await readAll(await send(deps, typed("hi")));
    await settle(pending);
    expect(g.calls.chat).toBe(1);
  });

  it("never counts taps, busy turns, resends or signed in users", async () => {
    const cases: {
      message: unknown;
      isGuest?: boolean;
      over?: Partial<ChatApiDeps>;
    }[] = [
      { message: approvalTap() },
      {
        message: typed("hi"),
        over: {
          handleTurn: async () => ok(turnOutput({ metered: true, busy: true })),
        },
      },
      {
        message: typed("hi"),
        over: { turnContext: inRun(0, { saved: true, answered: false }) },
      },
      { message: typed("hi"), isGuest: false },
    ];
    for (const c of cases) {
      const g = guards();
      const { deps, pending } = fakeDeps({
        guards: g.value,
        handleTurn: async () => ok(turnOutput({ metered: true })),
        ...c.over,
      });
      await readAll(await send(deps, c.message, c.isGuest ?? true));
      await settle(pending);
      expect(g.calls.chat).toBe(0);
    }
  });

  it("lets typed messages through at the daily limit while a run is in progress", async () => {
    const g = guards({ chat: 30 });
    const handle = vi.fn(async () => ok(turnOutput({ metered: false })));
    const { deps } = fakeDeps({
      guards: g.value,
      handleTurn: handle,
      turnContext: async () =>
        ok({
          active: {
            active: {
              run: {
                id: "r1",
                toolId: "sample",
                toolVersion: "2",
                status: "in_progress",
              },
              answers: [],
            },
            paused: [],
          } as unknown as TurnContext["active"],
          typedInRun: 0,
          message: { saved: false, answered: false },
          created: false,
        }),
    });
    await readAll(await send(deps, typed("what does that mean?")));
    expect(handle).toHaveBeenCalledOnce();
  });

  it("at the new chat limit, asks turnContext not to create and shows chats_daily", async () => {
    const g = guards({ chats: 20 });
    const turnContext = vi.fn(async () => err({ code: "chat_limit" as const }));
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({
      guards: g.value,
      turnContext,
      handleTurn: handle,
    });
    const chunks = await readAll(await send(deps, typed("hi")));
    expect(turnContext).toHaveBeenCalledWith(USER, CONV, MSG, false);
    expect(kindOf(chunks)).toEqual(["chats_daily"]);
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("counts a new chat once turnContext created it; an existing chat is not counted", async () => {
    const created = guards();
    const one = fakeDeps({
      guards: created.value,
      turnContext: async () =>
        ok({
          active: { active: null, paused: [] },
          typedInRun: 0,
          message: { saved: false, answered: false },
          created: true,
        }),
    });
    await readAll(await send(one.deps, typed("hi")));
    await settle(one.pending);
    expect(created.calls.chats).toBe(1);

    const existing = guards();
    const two = fakeDeps({ guards: existing.value });
    await readAll(await send(two.deps, typed("hi")));
    await settle(two.pending);
    expect(existing.calls.chats).toBe(0);
  });

  it("signed in users are never limited by the daily counts and may always create", async () => {
    const g = guards({ chat: 999, chats: 999 });
    const turnContext = vi.fn(async () =>
      ok({
        active: { active: null, paused: [] },
        typedInRun: 0,
        message: { saved: false, answered: false },
        created: false,
      }),
    );
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({
      guards: g.value,
      turnContext,
      handleTurn: handle,
    });
    await readAll(await send(deps, typed("hi"), false));
    expect(g.calls.read).toBe(0);
    expect(turnContext).toHaveBeenCalledWith(USER, CONV, MSG, true);
    expect(handle).toHaveBeenCalledOnce();
  });
});

describe("postChat: paid chat (spec 0004, AC-9, AC-10, AC-11)", () => {
  const RUN = "0190a000-0000-7000-8000-000000000b01";
  const send = (deps: ChatApiDeps, message: unknown, isGuest = false) =>
    postChat(deps, {
      userId: USER,
      isGuest,
      ip: "102.89.1.2",
      body: { conversationId: CONV, message },
    });

  const kindOf = (chunks: readonly UIMessageChunk[]) =>
    chunks.flatMap((c) =>
      c.type === "data-error"
        ? [(c as { data: { kind: string } }).data.kind]
        : [],
    );

  /** Billing fakes that record each call; `used` is today's free count. */
  const billing = (
    over: Partial<ChatApiDeps["billing"]> & { used?: number | null } = {},
  ) => {
    const { used = 0, ...rest } = over;
    const calls = {
      hold: vi.fn(async () => ok({ holdId: HOLD })),
      settle: vi.fn<ChatApiDeps["billing"]["settleChat"]>(async () => ({
        available: 26,
        held: 0,
      })),
      countFree: vi.fn<ChatApiDeps["billing"]["countFree"]>(async () => {}),
      openAccount: vi.fn<ChatApiDeps["billing"]["openAccount"]>(async () => ({
        created: true,
        granted: 30,
      })),
      freeUsed: vi.fn(async () => used),
    };
    const value: ChatApiDeps["billing"] = {
      config: billingConfig,
      freeUsed: calls.freeUsed,
      countFree: calls.countFree,
      noticeOnce: async () => true,
      openAccount: calls.openAccount,
      holdChat: calls.hold,
      settleChat: calls.settle,
      ...rest,
    };
    return { value, calls };
  };

  const ACCOUNT_FREE = billingConfig.chat.freePerDay.account;

  it("holds the ceiling past the allowance, then charges the real cost once", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const { deps, pending } = fakeDeps({ billing: b.value });
    const chunks = await readAll(await send(deps, typed("one more question")));
    await Promise.all(pending);
    expect(b.calls.openAccount).toHaveBeenCalledWith(USER, false, "102.89.1.2");
    expect(b.calls.hold).toHaveBeenCalledWith(
      USER,
      REPLY,
      billingConfig.chat.ceilingCredits,
    );
    expect(b.calls.settle).toHaveBeenCalledOnce();
    const [holdId, credits] = b.calls.settle.mock.calls[0] ?? [];
    expect(holdId).toBe(HOLD);
    expect(credits).toBeGreaterThanOrEqual(1);
    expect(credits).toBeLessThanOrEqual(billingConfig.chat.ceilingCredits);
    expect(chunks.at(-1)).toEqual({
      type: "finish",
      messageMetadata: {
        billing: {
          kind: "charged",
          credits,
          summary: { available: 26, held: 0 },
        },
      },
    });
    expect(b.calls.countFree).not.toHaveBeenCalled();
  });

  it("shows the short balance notice instead of the AI call when the ceiling is not covered", async () => {
    const b = billing({
      used: ACCOUNT_FREE,
      holdChat: async () =>
        err({ code: "insufficient_credits" as const, available: 2 }),
    });
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({ billing: b.value, handleTurn: handle });
    const chunks = await readAll(await send(deps, typed("hi")));
    expect(kindOf(chunks)).toEqual(["chat_credits"]);
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("gives a guest the sign up variant of the short balance notice", async () => {
    const b = billing({
      used: billingConfig.chat.freePerDay.guest,
      holdChat: async () =>
        err({ code: "insufficient_credits" as const, available: 0 }),
    });
    const { deps } = fakeDeps({ billing: b.value });
    const chunks = await readAll(await send(deps, typed("hi"), true));
    expect(kindOf(chunks)).toEqual(["chat_credits_guest"]);
    expect(b.calls.openAccount).toHaveBeenCalledWith(USER, true, "102.89.1.2");
  });

  it("treats an unknown free count (Redis down) as paid", async () => {
    const b = billing({ used: null });
    const { deps, pending } = fakeDeps({ billing: b.value });
    await readAll(await send(deps, typed("hi")));
    await Promise.all(pending);
    expect(b.calls.hold).toHaveBeenCalledOnce();
  });

  it("releases the hold (charges 0) when the AI call failed", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const { deps, pending } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ failed: Promise.resolve(true) })),
    });
    await readAll(await send(deps, typed("hi")));
    await Promise.all(pending);
    expect(b.calls.settle).toHaveBeenCalledWith(HOLD, 0);
  });

  /** An inner stream the test ends by hand, after the client disconnected. */
  const heldOpen = () => {
    const ctl: { c: ReadableStreamDefaultController<UIMessageChunk> | null } = {
      c: null,
    };
    const stream = new ReadableStream<UIMessageChunk>({
      start: (c) => {
        ctl.c = c;
      },
    });
    return { stream, ctl };
  };

  it("with resumable streams on, a disconnect lets the reply finish: saved whole and settled once (spec 0004, AC-10)", async () => {
    // Emulates the route's tee: one copy goes to the client, the other to the Redis
    // buffer, which keeps reading after the client is gone. This checks the billing and
    // saving behaviour; the route wiring is covered by the manual verify step.
    const b = billing({ used: ACCOUNT_FREE });
    const inner = heldOpen();
    const { deps, saved, pending } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ stream: inner.stream })),
    });
    const response = await send(deps, typed("hi"));
    if (response.kind !== "stream") throw new Error("expected a stream");
    const [client, buffer] = response.stream.tee();
    const buffered = readAll({ ...response, stream: buffer });
    const reader = client.getReader();
    await reader.read(); // the start chunk
    inner.ctl.c?.enqueue({ type: "text-start", id: "t" });
    inner.ctl.c?.enqueue({ type: "text-delta", id: "t", delta: "Half, " });
    // The client disconnects mid reply. Cancelling one tee branch settles only once both
    // are cancelled, so it is not awaited: the buffer copy is still reading.
    void reader.cancel();
    inner.ctl.c?.enqueue({
      type: "text-delta",
      id: "t",
      delta: "then the rest.",
    });
    inner.ctl.c?.enqueue({ type: "text-end", id: "t" });
    inner.ctl.c?.close();
    await buffered;
    await Promise.all(pending);
    expect(b.calls.settle).toHaveBeenCalledOnce();
    expect(JSON.stringify(saved.at(-1)?.message)).toContain("then the rest.");
  });

  it("with resumable streams off, charges nothing on a disconnect before any output", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const inner = heldOpen();
    const { deps } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ stream: inner.stream })),
    });
    const response = await send(deps, typed("hi"));
    if (response.kind !== "stream") throw new Error("expected a stream");
    const reader = response.stream.getReader();
    await reader.read(); // the start chunk
    await reader.cancel();
    inner.ctl.c?.close(); // the turn ends on the server after the disconnect
    await vi.waitFor(() =>
      expect(b.calls.settle).toHaveBeenCalledWith(HOLD, 0),
    );
  });

  it("with resumable streams off, charges the cost so far on a disconnect after output started", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const inner = heldOpen();
    const { deps } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ stream: inner.stream })),
    });
    const response = await send(deps, typed("hi"));
    if (response.kind !== "stream") throw new Error("expected a stream");
    const reader = response.stream.getReader();
    await reader.read(); // the start chunk
    inner.ctl.c?.enqueue({ type: "text-start", id: "t" });
    inner.ctl.c?.enqueue({ type: "text-delta", id: "t", delta: "Half" });
    for (;;) {
      const next = await reader.read();
      if (next.done || next.value.type === "text-delta") break;
    }
    await reader.cancel();
    inner.ctl.c?.close();
    await vi.waitFor(() => expect(b.calls.settle).toHaveBeenCalledOnce());
    expect(b.calls.settle.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(1);
  });

  it("releases the hold of a busy turn", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const { deps, pending } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ busy: true, metered: false })),
    });
    await readAll(await send(deps, typed("hi")));
    await Promise.all(pending);
    expect(b.calls.settle).toHaveBeenCalledWith(HOLD, 0);
    expect(b.calls.settle).toHaveBeenCalledOnce();
  });

  it("counts a free reply, and adds the once a day notice on the last free one", async () => {
    const b = billing({ used: ACCOUNT_FREE - 1 });
    const { deps } = fakeDeps({ billing: b.value });
    const chunks = await readAll(await send(deps, typed("hi")));
    expect(b.calls.countFree).toHaveBeenCalledWith(USER);
    expect(b.calls.hold).not.toHaveBeenCalled();
    expect(kindOf(chunks)).toEqual(["free_chat_used"]);
    expect(chunks.at(-1)).toEqual({
      type: "finish",
      messageMetadata: { billing: { kind: "free", freeLeft: 0 } },
    });
  });

  it("shows the last free notice only when it was not shown today", async () => {
    const b = billing({
      used: ACCOUNT_FREE - 1,
      noticeOnce: async () => false,
    });
    const { deps } = fakeDeps({ billing: b.value });
    const chunks = await readAll(await send(deps, typed("hi")));
    expect(kindOf(chunks)).toEqual([]);
  });

  it("does not count a free reply that failed", async () => {
    const b = billing({ used: 0 });
    const { deps } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ failed: Promise.resolve(true) })),
    });
    await readAll(await send(deps, typed("hi")));
    expect(b.calls.countFree).not.toHaveBeenCalled();
  });

  it("never bills a typed message while a run is in progress", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const { deps } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ metered: false })),
      turnContext: async () =>
        ok({
          active: {
            active: {
              run: {
                id: RUN,
                toolId: "sample",
                toolVersion: "2",
                status: "in_progress",
              },
              answers: [],
            },
            paused: [],
          } as unknown as TurnContext["active"],
          typedInRun: 0,
          message: { saved: false, answered: false },
          created: false,
        }),
    });
    await readAll(await send(deps, typed("what does that mean?")));
    expect(b.calls.hold).not.toHaveBeenCalled();
    expect(b.calls.countFree).not.toHaveBeenCalled();
  });

  it("never reads or bills a card tap", async () => {
    const b = billing({ used: ACCOUNT_FREE });
    const { deps } = fakeDeps({
      billing: b.value,
      handleTurn: async () => ok(turnOutput({ metered: false })),
    });
    await readAll(
      await send(deps, {
        id: MSG2,
        role: "user",
        parts: [
          {
            type: "data-answer",
            data: { runId: RUN, questionId: "q1", value: "a" },
          },
        ],
      }),
    );
    expect(b.calls.freeUsed).not.toHaveBeenCalled();
    expect(b.calls.hold).not.toHaveBeenCalled();
  });
});
