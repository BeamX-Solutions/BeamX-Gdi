import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import type { TurnContext } from "@/db/queries/conversations";
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
      burst: async () => true,
      dailyCounts: async () => ({ chat: 0, chats: 0 }),
      countChat: async () => {},
      countChats: async () => {},
    },
    limits: { maxChars: 4000, perRun: 40, chatPerGuest: 30, chatsPerGuest: 20 },
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
        context: { ownerId: USER, active, isGuest: true, ip: "1.2.3.4" },
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
      burst: boolean;
      chat: number;
      chats: number;
    }> = {},
  ) => {
    const calls = {
      burst: [] as [string, string | null][],
      chat: 0,
      chats: 0,
      read: 0,
    };
    const value: ChatApiDeps["guards"] = {
      burst: async (userId, ip) => {
        calls.burst.push([userId, ip]);
        return over.burst ?? true;
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
    const g = guards({ burst: false });
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
    expect(g.calls.burst).toEqual([[USER, IP]]);
    expect(turnContext).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("the burst limit applies to signed in users too", async () => {
    const g = guards({ burst: false });
    const { deps } = fakeDeps({ guards: g.value });
    const chunks = await readAll(await send(deps, typed("hi"), false));
    expect(kindOf(chunks)).toEqual(["slow_down"]);
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
