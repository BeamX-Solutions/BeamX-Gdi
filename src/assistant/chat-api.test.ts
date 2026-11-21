import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import type { NewMessage } from "@/db/queries/messages";
import type { UsageInput } from "@/db/queries/usage";
import { err, ok } from "@/lib/result";
import { makeRegistry } from "@/tools/_kit/registry";
import { sampleTool } from "@/tools/test-tools/sample";
import {
  limitHit,
  postChat,
  type ChatApiDeps,
  type ChatResponse,
} from "./chat-api";
import {
  handleTurn,
  type ChatUsage,
  type TurnDeps,
  type TurnOutput,
} from "./turn";

// Spec 0007, AC-2 and the POST /api/chat flow: `postChat` with fake deps, and with the
// real `handleTurn` over an in memory turn lock for the one writer per turn rules.

const USER = "0190a000-0000-7000-8000-000000000a01";
const OTHER = "0190a000-0000-7000-8000-000000000a02";
const CONV = "0190a000-0000-7000-8000-000000000c01";
const MSG = "0190a000-0000-7000-8000-000000000d01";
const MSG2 = "0190a000-0000-7000-8000-000000000d02";
const REPLY = "0190a000-0000-7000-8000-000000000e01";

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
      ok({ active: { active: null, paused: [] }, typedInRun: 0 }),
    handleTurn: async () => ok(turnOutput()),
    ownerOf: async () => ok(USER),
    appendMessage: async (ownerId, _c, message) => {
      saved.push({ ownerId, message });
      return ok(1);
    },
    recordUsage: async (input) => {
      usage.push(input);
    },
    finishStream: async (_c, streamId) => {
      finished.push(streamId);
    },
    limits: { maxChars: 4000, perRun: 40 },
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
      body: { conversationId: CONV, message: typed("hi") },
    });
    expect(result).toMatchObject({ status: 404, body: { code: "not_found" } });
    expect(handle).not.toHaveBeenCalled();
  });

  it("passes the route's context to the turn, so it does not read again", async () => {
    const active = { active: null, paused: [] };
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({
      turnContext: async () => ok({ active, typedInRun: 0 }),
      handleTurn: handle,
    });
    await readAll(
      await postChat(deps, {
        userId: USER,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ context: { ownerId: USER, active } }),
    );
  });
});

describe("postChat: one writer per turn (AC-2)", () => {
  it("wraps the turn in one message and saves exactly one assistant message", async () => {
    const { deps, saved } = fakeDeps();
    const chunks = await readAll(
      await postChat(deps, {
        userId: USER,
        body: { conversationId: CONV, message: typed("hi") },
      }),
    );
    expect(chunks.at(0)).toEqual({ type: "start", messageId: REPLY });
    expect(chunks.at(-1)).toEqual({ type: "finish" });
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
    aiTurn: async () => ({ stream: aiStream(), usage: Promise.resolve(null) }),
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

const approvalTap = (id = MSG) => ({
  id,
  role: "user",
  parts: [{ type: "tool-approval-response", approvalId: "a1", approved: true }],
});

const inRun = (typedInRun: number) => async () =>
  ok({ active: { active: null, paused: [] }, typedInRun });

describe("postChat: limits (spec 0007, AC-8)", () => {
  it("refuses typed text over the limit with a notice, no turn and nothing saved", async () => {
    const handle = vi.fn();
    const { deps, saved } = fakeDeps({ handleTurn: handle });
    const result = await postChat(deps, {
      userId: USER,
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
      body: { conversationId: CONV, message: typed("one more") },
    });
    expect(await readAll(result)).toContainEqual({
      type: "data-error",
      data: { kind: "limit_run", retry: false },
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("lets the 40th typed message through", async () => {
    const handle = vi.fn(async () => ok(turnOutput()));
    const { deps } = fakeDeps({ handleTurn: handle, turnContext: inRun(39) });
    await readAll(
      await postChat(deps, {
        userId: USER,
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
      body: { conversationId: CONV, message: typed("hi") },
    });
    expect(result).toMatchObject({ resumable: null });
    await readAll(result);
    expect(finished).toEqual([]);
  });
});
