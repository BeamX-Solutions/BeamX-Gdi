import { afterAll, describe, expect, it } from "vitest";
import type { UIMessageChunk } from "ai";
import * as conversations from "@/db/queries/conversations";
import * as messages from "@/db/queries/messages";
import * as runs from "@/db/queries/runs";
import { newId } from "@/db/id";
import { fundRun, guestTracker, unwrap } from "@/db/test/helpers";
import type { TurnLock } from "@/lib/turn-lock";
import { getTool, type QuestionView } from "@/tools/registry";
import { questionData, type QuestionData } from "./parts";
import { handleTurn, type TurnDeps } from "./turn";
import { turnQueryDeps } from "./turn-deps";

// Spec 0006, build plan task 2: handleTurn's card path against a real Neon branch, on a
// funded Stellar run. A guest taps through every card until the report card appears.

const t = guestTracker();
afterAll(t.cleanup);

const stellar = unwrap(getTool("stellar"));

const openLock = (): TurnLock => ({
  acquire: async () => true,
  release: async () => {},
});

const deps = (over: Partial<TurnDeps> = {}): TurnDeps => ({
  ...turnQueryDeps,
  lock: openLock(),
  aiTurn: async () => {
    throw new Error("no AI call expected on the card path");
  },
  ...over,
});

/** A guest with a chat and a funded in_progress Stellar run (like an approved start). */
const setup = async () => {
  const userId = await t.guest();
  const conv = await conversations.create(userId);
  const { run } = unwrap(
    await runs.start(userId, conv.id, stellar.id, stellar.version),
  );
  await fundRun(userId, run.id, stellar.creditPrice);
  return { userId, conversationId: conv.id, runId: run.id };
};

/** A value every card of this kind accepts. */
const validValue = (view: QuestionView): unknown => {
  switch (view.kind) {
    case "single":
      return view.options[0]?.value;
    case "multi":
      return view.options.slice(0, Math.max(view.min, 1)).map((o) => o.value);
    case "scale":
      return view.min;
    case "text":
      return view.input === "text" ? "Small shop owners in Lagos" : 1000;
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
};

const read = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
};

type Part = { readonly type: string; readonly data: unknown };

const dataParts = (chunks: readonly UIMessageChunk[]): readonly Part[] =>
  chunks.flatMap((c) =>
    c.type.startsWith("data-")
      ? [{ type: c.type, data: (c as { data: unknown }).data }]
      : [],
  );

/** Sends one card tap, saves the reply like #7's onFinish would, and returns its parts. */
const tap = async (
  ctx: { userId: string; conversationId: string },
  runId: string,
  questionId: string,
  value: unknown,
  d: TurnDeps = deps(),
) => {
  const result = unwrap(
    await handleTurn(d, {
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      message: {
        id: newId(),
        role: "user",
        parts: [{ type: "data-answer", data: { runId, questionId, value } }],
      },
    }),
  );
  expect(result.metered).toBe(false);
  const parts = dataParts(await read(result.stream));
  unwrap(
    await messages.append(ctx.userId, ctx.conversationId, [
      { id: newId(), role: "assistant", parts },
    ]),
  );
  return parts;
};

const asQuestion = (part: Part | undefined): QuestionData =>
  questionData.parse(part?.data);

describe("handleTurn card path on a real branch (AC-1, AC-6, AC-7)", () => {
  it("taps through a funded Stellar run to the report card with no AI call", async () => {
    const ctx = await setup();
    const first = stellar.questions[0];
    if (!first) throw new Error("Stellar has no questions");

    const state: { questionId: string; view: QuestionView } = {
      questionId: first.id,
      view: first,
    };
    const seen: string[] = [];
    for (let step = 0; step < stellar.questions.length + 1; step++) {
      seen.push(state.questionId);
      const [part] = await tap(
        ctx,
        ctx.runId,
        state.questionId,
        validValue(state.view),
      );
      if (part?.type === "data-report") {
        expect(part.data).toEqual({
          runId: ctx.runId,
          toolId: "stellar",
          toolName: stellar.name,
        });
        break;
      }
      const next = asQuestion(part);
      expect(next.note).toBeUndefined();
      expect(next.progress.question.index).toBe(seen.length + 1);
      state.questionId = next.questionId;
      state.view = next.view;
    }

    const stored = unwrap(await runs.get(ctx.userId, ctx.runId));
    expect(stored.run.status).toBe("completed");
    expect(stored.report?.status).toBe("pending");
    expect(stored.answers.map((a) => a.questionId).sort()).toEqual(
      [...seen].sort(),
    );
    expect(stored.answers.every((a) => a.source === "client")).toBe(true);

    // The user messages were saved under their client ids, one per tap.
    const page = unwrap(
      await messages.listRecent(ctx.userId, ctx.conversationId),
    );
    expect(page.messages.filter((m) => m.role === "user")).toHaveLength(
      seen.length,
    );
  });

  it("shows the open card again with a note for an invalid value and saves nothing", async () => {
    const ctx = await setup();
    const [part] = await tap(ctx, ctx.runId, "foundation", "not-an-option");
    const card = asQuestion(part);
    expect(card.questionId).toBe("foundation");
    expect(card.note).toBe("Pick one of the options.");
    const stored = unwrap(await runs.get(ctx.userId, ctx.runId));
    expect(stored.answers).toEqual([]);
  });

  it("keeps the open card after a reject: the latest shown question wins (AC-6b)", async () => {
    const ctx = await setup();
    const [second] = await tap(ctx, ctx.runId, "foundation", "all-three");
    expect(asQuestion(second).questionId).toBe("value_creation");
    // Re-answering the first card with a bad value shows the open card (value_creation).
    const [again] = await tap(ctx, ctx.runId, "foundation", "nope");
    expect(asQuestion(again).questionId).toBe("value_creation");
  });

  it("refuses another user's chat, and answers busy without saving when locked", async () => {
    const ctx = await setup();
    const stranger = await t.guest();
    const message = {
      id: newId(),
      role: "user",
      parts: [
        {
          type: "data-answer",
          data: {
            runId: ctx.runId,
            questionId: "foundation",
            value: "all-three",
          },
        },
      ],
    };
    expect(
      await handleTurn(deps(), {
        userId: stranger,
        conversationId: ctx.conversationId,
        message,
      }),
    ).toEqual({ ok: false, error: { code: "not_found" } });

    const busy = unwrap(
      await handleTurn(
        deps({
          lock: { acquire: async () => false, release: async () => {} },
        }),
        { userId: ctx.userId, conversationId: ctx.conversationId, message },
      ),
    );
    expect(dataParts(await read(busy.stream))).toEqual([
      { type: "data-error", data: { kind: "busy", retry: false } },
    ]);
    const page = unwrap(
      await messages.listRecent(ctx.userId, ctx.conversationId),
    );
    expect(page.messages).toEqual([]);
    expect(unwrap(await runs.get(ctx.userId, ctx.runId)).answers).toEqual([]);
  });
});
