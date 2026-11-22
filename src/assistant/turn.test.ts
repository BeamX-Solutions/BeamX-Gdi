import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { err, ok } from "@/lib/result";
import { makeRegistry } from "@/tools/_kit/registry";
import type { StoredAnswer } from "@/tools/registry";
import { sampleTool } from "@/tools/test-tools/sample";
import { CARD_REPLIES } from "./card-flow";
import { handleTurn, type ActiveRead, type TurnDeps } from "./turn";

// Spec 0006, AC-1, AC-6, AC-7: handleTurn with fake dependencies. The real queries are
// covered by turn.int.test.ts on a Neon branch.

const USER = "0190a000-0000-7000-8000-0000000000u1";
const LINKED = "0190a000-0000-7000-8000-0000000000u2";
const CONV = "0190a000-0000-7000-8000-0000000000c1";
const RUN = "0190a000-0000-7000-8000-000000000001";
const MSG = "0190a000-0000-7000-8000-0000000000aa";

const registry = makeRegistry([sampleTool]);

const row = (questionId: string, value: unknown, n = 1): StoredAnswer => ({
  questionId,
  value,
  updatedAt: `2026-11-20 10:00:0${n}+00`,
});

const activeWith = (answers: readonly StoredAnswer[]): ActiveRead => ({
  active: {
    run: { id: RUN, toolId: "sample", toolVersion: "2", status: "in_progress" },
    answers,
  },
  paused: [],
});

const NO_RUN: ActiveRead = { active: null, paused: [] };

const ALL_BUT_TEAM = [
  row("stage", "idea", 1),
  row("channels", ["market"], 2),
  row("confidence", 3, 3),
];

const AI_USAGE = {
  model: "claude-opus-5-5",
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const fakeDeps = (over: Partial<TurnDeps> = {}) => {
  const ids = { n: 0 };
  const saved: { questionId: string; value: unknown; source: string }[] = [];
  const appended: string[] = [];
  const lock = {
    acquire: vi.fn(async () => true),
    release: vi.fn(async () => {}),
  };
  const deps: TurnDeps = {
    ownerOf: async () => ok(USER),
    lock,
    appendMessage: async (_owner, _conv, m) => {
      appended.push(m.id);
      return ok(1);
    },
    getActive: async () => activeWith([]),
    recentMessages: async () => [],
    getRun: async () =>
      ok({
        run: {
          id: RUN,
          toolId: "sample",
          toolVersion: "2",
          status: "in_progress",
        },
        answers: [...ALL_BUT_TEAM, row("team_size", 2, 4)],
      }),
    saveAnswer: async (_o, _r, questionId, value, source) => {
      saved.push({ questionId, value, source });
      return ok({ questionId, source });
    },
    complete: async () => ok({}),
    getTool: registry.getTool,
    aiTurn: async () => ({
      stream: new ReadableStream<UIMessageChunk>({
        start: (c) => {
          c.enqueue({ type: "text-start", id: "t" });
          c.close();
        },
      }),
      usage: Promise.resolve(AI_USAGE),
      failed: Promise.resolve(false),
    }),
    newId: () => `id-${++ids.n}`,
    now: () => 0,
    log: () => {},
    ...over,
  };
  return { deps, saved, appended, lock };
};

const answer = (questionId: string, value: unknown) => ({
  id: MSG,
  role: "user",
  parts: [{ type: "data-answer", data: { runId: RUN, questionId, value } }],
});

const typed = (text: string) => ({
  id: MSG,
  role: "user",
  parts: [{ type: "text", text }],
});

const read = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
};

const dataOf = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((c) =>
    c.type.startsWith("data-")
      ? [{ type: c.type, data: (c as { data: unknown }).data }]
      : [],
  );

const textOf = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((c) => (c.type === "text-delta" ? [c.delta] : [])).join("");

describe("handleTurn: entry checks (AC-1)", () => {
  it("refuses an invalid message before any read", async () => {
    const { deps, lock } = fakeDeps();
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: { nope: true },
    });
    expect(result).toEqual(err({ code: "invalid_message" }));
    expect(lock.acquire).not.toHaveBeenCalled();
  });

  it("returns not_found when the chat belongs to someone else", async () => {
    const { deps, lock } = fakeDeps({ ownerOf: async () => ok(LINKED) });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
    });
    expect(result).toEqual(err({ code: "not_found" }));
    expect(lock.acquire).not.toHaveBeenCalled();
  });

  it("answers busy with no write and no AI call when the lock is taken", async () => {
    const aiTurn = vi.fn();
    const { deps, appended } = fakeDeps({
      lock: { acquire: async () => false, release: async () => {} },
      aiTurn,
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.metered).toBe(false);
    expect(result.value.busy).toBe(true);
    expect(await result.value.usage).toBeNull();
    expect(dataOf(await read(result.value.stream))).toEqual([
      { type: "data-error", data: { kind: "busy", retry: false } },
    ]);
    expect(appended).toEqual([]);
    expect(aiTurn).not.toHaveBeenCalled();
  });

  it("gives a busy turn a release that frees nothing (it never took the lock)", async () => {
    const release = vi.fn(async () => {});
    const { deps } = fakeDeps({
      lock: { acquire: async () => false, release },
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
    });
    if (!result.ok) throw new Error("expected ok");
    await result.value.release();
    expect(release).not.toHaveBeenCalled();
  });

  it("refuses a message whose id saved nothing (another role's or chat's id), with no AI call", async () => {
    const aiTurn = vi.fn();
    const { deps, lock } = fakeDeps({
      appendMessage: async () => ok(0),
      aiTurn,
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
    });
    expect(result).toEqual(err({ code: "invalid_message" }));
    expect(aiTurn).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("reuses the route's context instead of reading the owner again", async () => {
    const ownerOf = vi.fn(async () => ok(USER));
    const { deps } = fakeDeps({ ownerOf });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
      context: { ownerId: USER, active: NO_RUN },
    });
    expect(result.ok).toBe(true);
    expect(ownerOf).not.toHaveBeenCalled();
  });
});

describe("handleTurn: metering (AC-1)", () => {
  it("meters typed text with no run in progress, and holds the lock until release", async () => {
    const { deps, lock } = fakeDeps({ getActive: async () => NO_RUN });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("I have a business idea"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.metered).toBe(true);
    expect(result.value.busy).toBe(false);
    expect(await result.value.usage).toEqual(AI_USAGE);
    // The stream ending frees nothing: the route saves the reply first (spec 0007).
    await read(result.value.stream);
    expect(lock.release).not.toHaveBeenCalled();
    await result.value.release();
    await result.value.release();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("gives release that never throws, even when the lock release fails", async () => {
    const { deps } = fakeDeps({
      lock: {
        acquire: async () => true,
        release: async () => {
          throw new Error("redis down");
        },
      },
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("hi"),
    });
    if (!result.ok) throw new Error("expected ok");
    await expect(result.value.release()).resolves.toBeUndefined();
  });

  it("does not meter typed text during a run, approvals, or card taps", async () => {
    const during = await handleTurn(fakeDeps().deps, {
      userId: USER,
      conversationId: CONV,
      message: typed("what does this question mean?"),
    });
    expect(during.ok && during.value.metered).toBe(false);

    const approval = await handleTurn(
      fakeDeps({ getActive: async () => NO_RUN }).deps,
      {
        userId: USER,
        conversationId: CONV,
        message: {
          id: MSG,
          role: "user",
          parts: [
            { type: "tool-approval-response", approvalId: "a", approved: true },
          ],
        },
      },
    );
    expect(approval.ok && approval.value.metered).toBe(false);

    const card = await handleTurn(fakeDeps().deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("stage", "idea"),
    });
    expect(card.ok && card.value.metered).toBe(false);
  });

  it("releases the lock and rethrows when the AI turn fails to start", async () => {
    const { deps, lock } = fakeDeps({
      aiTurn: async () => {
        throw new Error("boom");
      },
    });
    await expect(
      handleTurn(deps, {
        userId: USER,
        conversationId: CONV,
        message: typed("hi"),
      }),
    ).rejects.toThrow("boom");
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});

describe("handleTurn: card path (AC-6, AC-7)", () => {
  it("saves a tapped answer with source client and returns the next card, with no AI call", async () => {
    const aiTurn = vi.fn();
    const { deps, saved, appended, lock } = fakeDeps({ aiTurn });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("stage", "idea"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(appended).toEqual([MSG]);
    expect(saved).toEqual([
      { questionId: "stage", value: "idea", source: "client" },
    ]);
    const [part] = dataOf(await read(result.value.stream));
    expect(part).toMatchObject({
      type: "data-question",
      data: {
        runId: RUN,
        questionId: "channels",
        progress: { question: { index: 2, total: 4 } },
      },
    });
    expect(aiTurn).not.toHaveBeenCalled();
    expect(await result.value.usage).toBeNull();
    // A card turn holds the lock until the route has saved its reply (spec 0007, AC-2).
    expect(lock.release).not.toHaveBeenCalled();
    await result.value.release();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("shows the open card again with a note for an invalid value, saving nothing", async () => {
    const { deps, saved } = fakeDeps();
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("stage", "nope"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(saved).toEqual([]);
    const [part] = dataOf(await read(result.value.stream));
    expect(part).toMatchObject({
      type: "data-question",
      data: { questionId: "stage", note: "Pick one of the options." },
    });
  });

  it("replies in text when there is no active run", async () => {
    const { deps, saved } = fakeDeps({ getActive: async () => NO_RUN });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("stage", "idea"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(textOf(await read(result.value.stream))).toBe(
      CARD_REPLIES.noActiveRun,
    );
    expect(saved).toEqual([]);
  });

  it("completes on the last answer and shows the report card", async () => {
    const complete = vi.fn(async () => ok({}));
    const { deps } = fakeDeps({
      getActive: async () => activeWith(ALL_BUT_TEAM),
      complete,
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("team_size", 2),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(dataOf(await read(result.value.stream))).toEqual([
      {
        type: "data-report",
        data: { runId: RUN, toolId: "sample", toolName: "Sample" },
      },
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("scores again once on answers_changed, then shows complete_retry", async () => {
    const complete = vi.fn(async () =>
      err({ code: "answers_changed" as const }),
    );
    const { deps } = fakeDeps({
      getActive: async () => activeWith(ALL_BUT_TEAM),
      complete,
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("team_size", 2),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(dataOf(await read(result.value.stream))).toEqual([
      {
        type: "data-error",
        data: { kind: "complete_retry", retry: true, runId: RUN },
      },
    ]);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("runs completion again on data-retry", async () => {
    const { deps } = fakeDeps({
      getActive: async () =>
        activeWith([...ALL_BUT_TEAM, row("team_size", 2, 4)]),
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: {
        id: MSG,
        role: "user",
        parts: [
          { type: "data-retry", data: { runId: RUN, action: "complete" } },
        ],
      },
    });
    if (!result.ok) throw new Error("expected ok");
    const [part] = dataOf(await read(result.value.stream));
    expect(part?.type).toBe("data-report");
  });
});

describe("handleTurn: guest link mid turn (AC-1)", () => {
  it("reads the owner again on not_found and retries the write once", async () => {
    const owners = [USER, LINKED];
    const writers: string[] = [];
    const { deps } = fakeDeps({
      ownerOf: async () => ok(owners.shift() ?? LINKED),
      saveAnswer: async (owner, _r, questionId, _v, source) => {
        writers.push(owner);
        return owner === LINKED
          ? ok({ questionId, source })
          : err({ code: "not_found_or_not_in_progress" as const });
      },
    });
    const result = await handleTurn(deps, {
      userId: USER,
      conversationId: CONV,
      message: answer("stage", "idea"),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(writers).toEqual([USER, LINKED]);
    const [part] = dataOf(await read(result.value.stream));
    expect(part?.type).toBe("data-question");
  });
});
