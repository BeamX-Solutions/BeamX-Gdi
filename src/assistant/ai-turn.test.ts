import { describe, expect, it } from "vitest";
import {
  readUIMessageStream,
  simulateReadableStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { err, ok } from "@/lib/result";
import { makeRegistry } from "@/tools/_kit/registry";
import type { StoredAnswer, ToolModule } from "@/tools/registry";
import { sampleTool } from "@/tools/test-tools/sample";
import {
  AI_REPLIES,
  createAiTurn,
  INSTRUCTIONS_MESSAGE,
  type AiTurnDeps,
} from "./ai-turn";
import type { SavedMessage } from "./parts";
import { startRunDescription, startRunInput } from "./tools/start-run";
import type { ActiveRead, AiTurnContext } from "./turn";

// Spec 0006, AC-2, AC-3, AC-8, AC-13, AC-14: the AI turn on the AI SDK mock model, with
// fake queries. No network, no database.

const USER = "0190a000-0000-7000-8000-0000000000u1";
const CONV = "0190a000-0000-7000-8000-0000000000c1";
const RUN = "0190a000-0000-7000-8000-000000000001";

const registry = makeRegistry([sampleTool]);

// ---------------------------------------------------------------------------
// Mock model
// ---------------------------------------------------------------------------

type Call = { readonly toolName: string; readonly input: object };
type Reply =
  | { readonly text: string }
  | { readonly calls: readonly Call[] }
  | { readonly fail: true }
  | { readonly refuse: true };

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const finish = (unified: "stop" | "tool-calls" | "content-filter") => ({
  type: "finish" as const,
  finishReason: { unified, raw: undefined },
  logprobs: undefined,
  usage,
});

const ids = { call: 0 };

/** The mock model's stream part type (not exported by `ai/test`). */
type StreamPart =
  Awaited<
    ReturnType<MockLanguageModelV4["doStream"]>
  >["stream"] extends ReadableStream<infer P>
    ? P
    : never;

const chunksFor = (reply: Reply): StreamPart[] => {
  if ("fail" in reply) throw new Error("model down");
  if ("refuse" in reply) return [finish("content-filter")];
  if ("text" in reply)
    return [
      { type: "text-start" as const, id: "t1" },
      { type: "text-delta" as const, id: "t1", delta: reply.text },
      { type: "text-end" as const, id: "t1" },
      finish("stop"),
    ];
  return [
    ...reply.calls.map((c) => ({
      type: "tool-call" as const,
      toolCallId: `call-${++ids.call}`,
      toolName: c.toolName,
      input: JSON.stringify(c.input),
    })),
    finish("tool-calls"),
  ];
};

/** A model that plays `replies` in order, one per step, and records each prompt. */
const scriptedModel = (replies: readonly Reply[]) => {
  const calls: { prompt: unknown; tools: unknown }[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push({ prompt: options.prompt, tools: options.tools });
      const reply = replies[calls.length - 1] ?? { text: "Okay." };
      return { stream: simulateReadableStream({ chunks: chunksFor(reply) }) };
    },
  });
  return { model, calls };
};

// ---------------------------------------------------------------------------
// Fake deps
// ---------------------------------------------------------------------------

const row = (questionId: string, value: unknown, n = 1): StoredAnswer => ({
  questionId,
  value,
  updatedAt: `2026-11-20 10:00:0${n}+00`,
});

const runRow = (id = RUN) => ({
  id,
  toolId: "sample",
  toolVersion: "2",
  status: "in_progress",
});

type World = {
  history: SavedMessage[];
  answers: StoredAnswer[] | null;
  started: { toolId: string; price: number }[];
  saved: { questionId: string; value: unknown; source: string }[];
  completed: string[];
  logs: { event: string; fields: Record<string, unknown> }[];
};

const makeWorld = (over: Partial<World> = {}): World => ({
  history: [],
  answers: null,
  started: [],
  saved: [],
  completed: [],
  logs: [],
  ...over,
});

const activeOf = (world: World): ActiveRead => ({
  active:
    world.answers === null
      ? null
      : { run: runRow(), answers: [...world.answers] },
  paused: [],
});

const fakeDeps = (
  world: World,
  model: MockLanguageModelV4,
  over: Partial<AiTurnDeps> = {},
): AiTurnDeps => ({
  ownerOf: async () => ok(USER),
  getRun: async () =>
    ok({
      run: runRow(),
      answers: [...(world.answers ?? [])],
    }),
  complete: async (_o, runId) => {
    world.completed.push(runId);
    return ok({});
  },
  log: (event, fields) => world.logs.push({ event, fields }),
  tools: registry.tools,
  getTool: registry.getTool,
  getActive: async () => activeOf(world),
  saveAnswer: async (_o, _r, questionId, value, source) => {
    world.saved.push({ questionId, value, source });
    world.answers = [
      ...(world.answers ?? []).filter((a) => a.questionId !== questionId),
      row(questionId, value, 9),
    ];
    return ok({});
  },
  ensureAccount: async () => ({ created: false, granted: 0 }),
  startRunWithHold: async (_o, _c, toolId, _v, price) => {
    world.started.push({ toolId, price });
    world.answers = [];
    return ok({ runId: RUN });
  },
  openChat: async () => ok({ messages: [...world.history], runs: [] }),
  model: () => ({
    id: "mock",
    model,
    providerOptions: { anthropic: { effort: "low" } },
  }),
  newId: (() => {
    const n = { i: 0 };
    return () => `gen-${++n.i}`;
  })(),
  now: () => 0,
  ...over,
});

const userText = (id: string, text: string): SavedMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const textTurn = (world: World, id: string, text: string): AiTurnContext => {
  world.history.push(userText(id, text));
  return {
    ownerId: USER,
    conversationId: CONV,
    message: { id, role: "user", parts: [{ type: "text", text }] },
    active: activeOf(world),
    turn: { kind: "text", text },
  };
};

const approvalTurn = (
  world: World,
  id: string,
  approvalId: string,
  approved: boolean,
): AiTurnContext => {
  const part = {
    type: "tool-approval-response" as const,
    approvalId,
    approved,
  };
  world.history.push({ id, role: "user", parts: [part] });
  return {
    ownerId: USER,
    conversationId: CONV,
    message: { id, role: "user", parts: [part] },
    active: activeOf(world),
    turn: { kind: "approval", responses: [part] },
  };
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

/** The assistant message #7 would save from these chunks. */
const asMessage = async (
  id: string,
  chunks: readonly UIMessageChunk[],
): Promise<SavedMessage> => {
  const last = { message: null as UIMessage | null };
  for await (const message of readUIMessageStream({
    stream: simulateReadableStream({
      chunks: [{ type: "start", messageId: id } as UIMessageChunk, ...chunks],
    }),
  }))
    last.message = message;
  return { id, role: "assistant", parts: last.message?.parts ?? [] };
};

const dataOf = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((c) =>
    c.type.startsWith("data-")
      ? [{ type: c.type, data: (c as { data: Record<string, unknown> }).data }]
      : [],
  );

const textOf = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((c) => (c.type === "text-delta" ? [c.delta] : [])).join("");

const approvalOf = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((c) =>
    c.type === "tool-approval-request" ? [c.approvalId] : [],
  );

const inputOf = (chunks: readonly UIMessageChunk[], toolName: string) =>
  chunks.flatMap((c) =>
    c.type === "tool-input-available" && c.toolName === toolName
      ? [c.input as Record<string, unknown>]
      : [],
  );

// ---------------------------------------------------------------------------
// AC-2: the registry builds startRun
// ---------------------------------------------------------------------------

describe("startRun from the registry (AC-2)", () => {
  const extra = {
    ...sampleTool,
    id: "extra",
    name: "Extra",
    whenToUse: "When the client wants extra things.",
  } satisfies ToolModule;
  const both = makeRegistry([sampleTool, extra]);

  it("lists every registered tool's name and when to use it", () => {
    const text = startRunDescription(both.tools);
    expect(text).toContain("- sample (Sample): Never; tests only.");
    expect(text).toContain(
      "- extra (Extra): When the client wants extra things.",
    );
  });

  it("builds the toolId enum from the registry", () => {
    const schema = startRunInput(both.tools);
    expect(schema.safeParse({ toolId: "extra" }).success).toBe(true);
    expect(schema.safeParse({ toolId: "stellar" }).success).toBe(false);
    expect(schema.safeParse({ toolId: "sample", price: 1 }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// AC-3: approval
// ---------------------------------------------------------------------------

describe("startRun approval (AC-3)", () => {
  it("asks for approval with the server written price and never starts on its own", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([
      {
        calls: [
          { toolName: "startRun", input: { toolId: "sample", shownPrice: 0 } },
        ],
      },
    ]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "I have a business idea"),
      ),
    );
    expect(approvalOf(chunks)).toHaveLength(1);
    // The model tried to set the price; the server wrote the real one.
    expect(inputOf(chunks, "startRun")[0]).toEqual({
      toolId: "sample",
      shownPrice: 5,
    });
    expect(world.started).toEqual([]);
    // A pending approval adds no question card (AC-8).
    expect(dataOf(chunks)).toEqual([]);
    expect(world.logs).toContainEqual({
      event: "assistant_route",
      fields: { toolId: "sample" },
    });
  });

  const proposeThen = async (
    world: World,
    price: { first: number; later: number },
    approved: boolean,
    after: readonly Reply[],
  ) => {
    const tool = { current: { ...sampleTool, creditPrice: price.first } };
    const getTool = (id: string) =>
      id === "sample" ? ok(tool.current) : registry.getTool(id);
    const first = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
    ]);
    const proposed = await read(
      await createAiTurn(fakeDeps(world, first.model, { getTool }))(
        textTurn(world, "m1", "I have a business idea"),
      ),
    );
    world.history.push(await asMessage("a1", proposed));
    const approvalId = approvalOf(proposed)[0] ?? "missing";

    tool.current = { ...sampleTool, creditPrice: price.later };
    const second = scriptedModel(after);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, second.model, { getTool }))(
        approvalTurn(world, "m2", approvalId, approved),
      ),
    );
    return { chunks, calls: second.calls };
  };

  it("an approved card starts the run at the server price and shows the first card", async () => {
    const world = makeWorld();
    const { chunks } = await proposeThen(world, { first: 5, later: 5 }, true, [
      { text: "Great, let's begin." },
    ]);
    expect(world.started).toEqual([{ toolId: "sample", price: 5 }]);
    expect(textOf(chunks)).toBe("Great, let's begin.");
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ runId: RUN, questionId: "stage" }),
      }),
    ]);
  });

  it("an approved run carries on into the next typed turn (saved as new messages)", async () => {
    const world = makeWorld();
    const { chunks, calls } = await proposeThen(
      world,
      { first: 5, later: 5 },
      true,
      [{ text: "Started." }],
    );
    // The note after the approved call already shows the new run.
    expect(JSON.stringify(calls[0]?.prompt)).toContain(
      "Active run: Sample (run",
    );
    world.history.push(await asMessage("a2", chunks));

    const third = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "stage", value: "idea" },
          },
        ],
      },
      { text: "Noted." },
    ]);
    const next = await read(
      await createAiTurn(fakeDeps(world, third.model))(
        textTurn(world, "m3", "just an idea"),
      ),
    );
    expect(dataOf(next)).not.toContainEqual(
      expect.objectContaining({ type: "data-error" }),
    );
    // The model saw the call, the tap and the result in order.
    expect(JSON.stringify(third.calls[0]?.prompt)).toContain(
      '"ok":true,"runId"',
    );
    expect(world.saved).toEqual([
      { questionId: "stage", value: "idea", source: "chat" },
    ]);
  });

  it("a price change between the card and the tap starts nothing", async () => {
    const world = makeWorld();
    const { chunks, calls } = await proposeThen(
      world,
      { first: 5, later: 7 },
      true,
      [{ calls: [{ toolName: "startRun", input: { toolId: "sample" } }] }],
    );
    expect(world.started).toEqual([]);
    // The model saw the refusal and asked again: a fresh card at the new price.
    expect(JSON.stringify(calls[0]?.prompt)).toContain("does not match");
    expect(inputOf(chunks, "startRun").at(-1)).toEqual({
      toolId: "sample",
      shownPrice: 7,
    });
    expect(approvalOf(chunks)).toHaveLength(1);
  });

  it("a declined card does nothing and the assistant acknowledges it", async () => {
    const world = makeWorld();
    const { chunks } = await proposeThen(world, { first: 5, later: 5 }, false, [
      { text: "No problem." },
    ]);
    expect(world.started).toEqual([]);
    expect(textOf(chunks)).toBe("No problem.");
    expect(dataOf(chunks)).toEqual([]);
  });

  it("a tap for an unknown approval makes no model call", async () => {
    const world = makeWorld();
    const { model, calls } = scriptedModel([{ text: "never" }]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        approvalTurn(world, "m2", "nope", true),
      ),
    );
    expect(calls).toHaveLength(0);
    expect(textOf(chunks)).toBe(AI_REPLIES.approvalExpired);
  });

  it("insufficient credits comes back as a typed result", async () => {
    const world = makeWorld();
    const insufficient: AiTurnDeps["startRunWithHold"] = async () =>
      err({ code: "insufficient_credits", available: 2 });
    const first = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
    ]);
    const proposed = await read(
      await createAiTurn(fakeDeps(world, first.model))(
        textTurn(world, "m1", "idea"),
      ),
    );
    world.history.push(await asMessage("a1", proposed));
    const second = scriptedModel([{ text: "You need more credits." }]);
    await read(
      await createAiTurn(
        fakeDeps(world, second.model, { startRunWithHold: insufficient }),
      )(approvalTurn(world, "m2", approvalOf(proposed)[0] ?? "", true)),
    );
    expect(JSON.stringify(second.calls[0]?.prompt)).toContain('"shortfall":3');
  });
});

// ---------------------------------------------------------------------------
// AC-8: typed answers and reopened cards
// ---------------------------------------------------------------------------

describe("typed answers during a run (AC-8, AC-9)", () => {
  const openCardWorld = () =>
    makeWorld({
      answers: [],
      history: [
        {
          id: "a0",
          role: "assistant",
          parts: [
            {
              type: "data-question",
              data: {
                runId: RUN,
                questionId: "stage",
                view: sampleTool.questions[0],
                progress: { question: { index: 1, total: 4 } },
              },
            },
          ],
        },
      ],
    });

  it("a typed answer is saved with source chat, then the next card shows", async () => {
    const world = openCardWorld();
    const { model } = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "stage", value: "idea" },
          },
        ],
      },
      { text: "Got it." },
    ]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "it's still just an idea"),
      ),
    );
    expect(world.saved).toEqual([
      { questionId: "stage", value: "idea", source: "chat" },
    ]);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ questionId: "channels" }),
      }),
    ]);
  });

  it("an invalid value saves nothing and the open card shows again", async () => {
    const world = openCardWorld();
    const { model, calls } = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "stage", value: "maybe" },
          },
        ],
      },
      { text: "Please pick one of the options." },
    ]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "maybe"),
      ),
    );
    expect(world.saved).toEqual([]);
    expect(JSON.stringify(calls[1]?.prompt)).toContain("invalid_answer");
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });

  it("a side question gets a reply, then the same open card", async () => {
    const world = openCardWorld();
    const { model } = scriptedModel([{ text: "It takes about 5 minutes." }]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "how long is this?"),
      ),
    );
    expect(textOf(chunks)).toBe("It takes about 5 minutes.");
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });

  it("a hidden question can't be saved", async () => {
    const world = openCardWorld();
    const { model, calls } = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "monthly_sales", value: 100 },
          },
        ],
      },
      { text: "ok" },
    ]);
    await read(
      await createAiTurn(fakeDeps(world, model))(textTurn(world, "m1", "100k")),
    );
    expect(world.saved).toEqual([]);
    expect(JSON.stringify(calls[1]?.prompt)).toContain("not_visible");
  });

  it("showQuestion reopens an answered card", async () => {
    const world = openCardWorld();
    world.answers = [row("stage", "idea", 1)];
    const { model } = scriptedModel([
      {
        calls: [
          {
            toolName: "showQuestion",
            input: { runId: RUN, questionId: "stage" },
          },
        ],
      },
      { text: "Sure, here it is." },
    ]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "change my first answer"),
      ),
    );
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });

  it("a typed answer that finishes the run completes it and shows the report card", async () => {
    const world = makeWorld({
      answers: [
        row("stage", "idea", 1),
        row("channels", ["market"], 2),
        row("confidence", 3, 3),
      ],
    });
    const { model } = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "team_size", value: 2 },
          },
        ],
      },
      { text: "All done." },
    ]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "two of us"),
      ),
    );
    expect(world.completed).toEqual([RUN]);
    expect(dataOf(chunks)).toEqual([
      {
        type: "data-report",
        data: { runId: RUN, toolId: "sample", toolName: "Sample" },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// AC-13 prompt layout, AC-14 failures
// ---------------------------------------------------------------------------

describe("prompt layout (AC-13)", () => {
  it("keeps tools and instructions byte stable, with the note last and two breakpoints", async () => {
    const world = makeWorld({ answers: [] });
    const first = scriptedModel([{ text: "Hi." }]);
    await read(
      await createAiTurn(fakeDeps(world, first.model))(
        textTurn(world, "m1", "hello"),
      ),
    );
    world.history.push({
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Hi." }],
    });
    const second = scriptedModel([{ text: "Sure." }]);
    await read(
      await createAiTurn(fakeDeps(world, second.model))(
        textTurn(world, "m2", "what can you do?"),
      ),
    );

    const a = first.calls[0];
    const b = second.calls[0];
    expect(JSON.stringify(b?.tools)).toBe(JSON.stringify(a?.tools));
    const promptA = a?.prompt as {
      role: string;
      content: unknown;
      providerOptions?: unknown;
    }[];
    const promptB = b?.prompt as typeof promptA;
    expect(promptB[0]).toEqual(promptA[0]);
    expect(promptA[0]).toMatchObject({
      role: "system",
      content: INSTRUCTIONS_MESSAGE.content,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });

    const note = promptB.at(-1);
    expect(note).toMatchObject({
      role: "system",
      providerOptions: { anthropic: { clearAt: "next_user_message" } },
    });
    expect(JSON.stringify(note?.content)).toContain("<run_state>");
    const lastHistory = promptB.at(-2);
    expect(lastHistory?.role).toBe("user");
    expect(JSON.stringify(lastHistory)).toContain("ephemeral");
    expect(JSON.stringify(b?.tools).indexOf("startRun")).toBeLessThan(
      JSON.stringify(b?.tools).indexOf("saveAnswer"),
    );
  });
});

describe("failures (AC-14)", () => {
  it("a model error ends with the try again card", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([{ fail: true }]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "hello"),
      ),
    );
    expect(dataOf(chunks)).toEqual([
      { type: "data-error", data: { kind: "ai_error", retry: true } },
    ]);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
  });

  it("a refusal ends with the refusal card and is logged", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([{ refuse: true }]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, model))(
        textTurn(world, "m1", "hello"),
      ),
    );
    expect(dataOf(chunks)).toEqual([
      { type: "data-error", data: { kind: "refusal", retry: true } },
    ]);
    expect(world.logs.map((l) => l.event)).toContain("assistant_refusal");
  });

  it("a tool that throws becomes a typed result the model explains", async () => {
    const world = makeWorld({ answers: [] });
    const { model, calls } = scriptedModel([
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "stage", value: "idea" },
          },
        ],
      },
      { text: "Something went wrong saving that." },
    ]);
    const chunks = await read(
      await createAiTurn(
        fakeDeps(world, model, {
          saveAnswer: async () => {
            throw new Error("db down");
          },
        }),
      )(textTurn(world, "m1", "idea")),
    );
    expect(JSON.stringify(calls[1]?.prompt)).toContain("db down");
    expect(textOf(chunks)).toBe("Something went wrong saving that.");
  });
});
