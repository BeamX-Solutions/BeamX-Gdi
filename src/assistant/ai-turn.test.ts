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
  sumUsage,
  type AiTurnDeps,
} from "./ai-turn";
import type { RunQuote, StartFromHoldError } from "@/db/queries/credits";
import type { UsageInput } from "@/db/queries/usage";
import type { OldAnswer } from "./ai-turn";
import type { SavedMessage } from "./parts";
import { startRunDescription, startRunInput } from "./tools/start-run";
import type { ActiveRead, AiTurnContext, AiTurnResult } from "./turn";

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
  /** `runQuote` answers by run id, read in order when a list is given. */
  quotes: Record<string, RunQuote | (RunQuote | "throw" | "missing")[]>;
  resumed: { runId: string; price: number | null }[];
  restarted: { previousRunId: string; version: string; price: number }[];
  stopped: string[];
  usage: UsageInput[];
  oldAnswers: OldAnswer[];
  /** What `startFromWithHold` returns when set (otherwise a copied run). */
  startFromError: StartFromHoldError | null;
  /** The owner's profile facts (spec 0012). */
  profile: { key: string; value: unknown }[];
};

const makeWorld = (over: Partial<World> = {}): World => ({
  history: [],
  answers: null,
  started: [],
  saved: [],
  completed: [],
  logs: [],
  quotes: {},
  resumed: [],
  restarted: [],
  stopped: [],
  usage: [],
  oldAnswers: [],
  startFromError: null,
  profile: [],
  ...over,
});

const quote = (over: Partial<RunQuote> = {}): RunQuote => ({
  toolId: "sample",
  toolVersion: "2",
  status: "paused",
  conversationId: CONV,
  heldAmount: null,
  ...over,
});

/** The next scripted quote for a run: a list is consumed, its last entry repeats. */
const nextQuote = (world: World, runId: string) => {
  const entry = world.quotes[runId];
  if (entry === undefined) return "missing" as const;
  if (!Array.isArray(entry)) return entry;
  const head = entry.length > 1 ? entry.shift() : entry[0];
  return head ?? ("missing" as const);
};

/** A helper model that fails, so extraction falls back unless a test sets one. */
const failingHelper = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error("helper not expected");
  },
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
  getSummary: async () => null,
  runQuote: async (_o, runId) => {
    const next = nextQuote(world, runId);
    if (next === "throw") throw new Error("db down");
    return next === "missing" ? err({ code: "not_found" }) : ok(next);
  },
  resumeRun: async (_o, runId) => {
    world.resumed.push({ runId, price: null });
    world.answers = [];
    return ok({ runId });
  },
  resumeRunWithHold: async (_o, runId, price) => {
    world.resumed.push({ runId, price });
    world.answers = [];
    return ok({ runId });
  },
  startFromWithHold: async (_o, previousRunId, version, price) => {
    if (world.startFromError) return err(world.startFromError);
    world.restarted.push({ previousRunId, version, price });
    world.answers = [row("stage", "idea"), row("channels", ["market"], 2)];
    return ok({ runId: RUN });
  },
  abandonRun: async (_o, runId) => {
    world.stopped.push(runId);
    world.answers = null;
    return ok({});
  },
  openChat: async () => ok({ messages: [...world.history], runs: [] }),
  offerConsultation: async () =>
    ok({ id: "consult-1", status: "offered" as const, startTime: null }),
  calendlyUrl: "https://calendly.com/beamxsolutions",
  limits: {
    guestSpendCap: async () => ok(undefined),
    takeRun: async () => ok({ keys: [] }),
    giveBackRun: async () => {},
  },
  model: () => ({
    id: "mock",
    model,
    providerOptions: { anthropic: { effort: "low" } },
  }),
  helperModel: () => ({
    id: "mock-helper",
    model: failingHelper,
    providerOptions: { anthropic: { effort: "low" } },
  }),
  recordUsage: async (input) => {
    world.usage.push(input);
    return { status: "recorded", id: "u1" };
  },
  oldAnswers: async () => ok([...world.oldAnswers]),
  profileFacts: async () => [...world.profile],
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
    isGuest: false,
    ip: null,
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
    isGuest: false,
    ip: null,
    turn: { kind: "approval", responses: [part] },
  };
};

const read = async (input: ReadableStream<UIMessageChunk> | AiTurnResult) => {
  const chunks: UIMessageChunk[] = [];
  const reader = ("stream" in input ? input.stream : input).getReader();
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
      availableBalance: 30,
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
    over: Partial<AiTurnDeps> = {},
  ) => {
    const tool = { current: { ...sampleTool, creditPrice: price.first } };
    const getTool = (id: string) =>
      id === "sample" ? ok(tool.current) : registry.getTool(id);
    const first = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
    ]);
    const proposed = await read(
      await createAiTurn(fakeDeps(world, first.model, { ...over, getTool }))(
        textTurn(world, "m1", "I have a business idea"),
      ),
    );
    world.history.push(await asMessage("a1", proposed));
    const approvalId = approvalOf(proposed)[0] ?? "missing";

    tool.current = { ...sampleTool, creditPrice: price.later };
    const second = scriptedModel(after);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, second.model, { ...over, getTool }))(
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

  it("the card shows the account's available credits when an account exists (spec 0007)", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
    ]);
    const chunks = await read(
      await createAiTurn(
        fakeDeps(world, model, {
          getSummary: async () => ({ available: 12, held: 30 }),
        }),
      )(textTurn(world, "m1", "I have a business idea")),
    );
    expect(inputOf(chunks, "startRun")[0]).toEqual({
      toolId: "sample",
      shownPrice: 5,
      availableBalance: 12,
    });
  });

  it("a failed balance read shows no card and starts nothing (fail closed)", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
      { text: "Sorry, try again." },
    ]);
    const chunks = await read(
      await createAiTurn(
        fakeDeps(world, model, {
          getSummary: async () => {
            throw new Error("db down");
          },
        }),
      )(textTurn(world, "m1", "I have a business idea")),
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(inputOf(chunks, "startRun")[0]).toEqual({ toolId: "sample" });
    expect(world.started).toEqual([]);
  });

  it("an approved start returns the credit summary for the chip (spec 0007, AC-9)", async () => {
    const world = makeWorld();
    const { chunks } = await proposeThen(
      world,
      { first: 5, later: 5 },
      true,
      [{ text: "Started." }],
      { getSummary: async () => ({ available: 25, held: 5 }) },
    );
    const outputs = chunks.flatMap((c) =>
      c.type === "tool-output-available" ? [c.output] : [],
    );
    expect(outputs).toContainEqual(
      expect.objectContaining({
        ok: true,
        summary: { available: 25, held: 5 },
      }),
    );
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
      availableBalance: 30,
    });
    expect(approvalOf(chunks)).toHaveLength(1);
  });

  it("a turned down approval leaves a history the next turn can send", async () => {
    const world = makeWorld();
    const { chunks, calls } = await proposeThen(
      world,
      { first: 5, later: 7 },
      true,
      [{ calls: [{ toolName: "startRun", input: { toolId: "sample" } }] }],
    );
    // #7 saves the reply, then the client types again.
    world.history.push(await asMessage("a2", chunks));
    const third = scriptedModel([{ text: "Okay." }]);
    await read(
      await createAiTurn(fakeDeps(world, third.model))(
        textTurn(world, "m3", "What happened?"),
      ),
    );
    type Prompt = {
      role: string;
      content: { type: string; output?: { type: string; value?: unknown } }[];
    }[];
    const errorTexts = (prompt: unknown) =>
      (prompt as Prompt)
        .filter((m) => m.role === "tool")
        .flatMap((m) => m.content)
        .flatMap((c) =>
          c.type === "tool-result" && c.output?.type === "error-text"
            ? [String(c.output.value)]
            : [],
        );
    const seen = errorTexts(calls[0]?.prompt);
    const replayed = errorTexts(third.calls[0]?.prompt);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("does not match");
    // Anthropic rejects an empty error result, and with thinking a changed one: the
    // next turn must replay exactly what the model received.
    expect(replayed).toEqual(seen);
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
// Spec 0008: the guest guards at Approve (AC-2, AC-4)
// ---------------------------------------------------------------------------

/** Run counters and a spend switch, recorded so a test can check what was taken. */
const fakeLimits = (opts: { max?: number; capped?: boolean } = {}) => {
  const state = { taken: 0, givenBack: 0, ips: [] as (string | null)[] };
  const limits: AiTurnDeps["limits"] = {
    guestSpendCap: async () =>
      opts.capped ? err({ code: "spend_cap" }) : ok(undefined),
    takeRun: async (_userId, ip) => {
      state.ips.push(ip);
      if (state.taken - state.givenBack >= (opts.max ?? 3))
        return err({ code: "run_limit" });
      state.taken += 1;
      return ok({ keys: ["k"] });
    },
    giveBackRun: async () => {
      state.givenBack += 1;
    },
  };
  return { state, limits };
};

/** Proposes with a typed turn, then taps Approve as a guest (or not) from an IP. */
const tapAs = async (
  world: World,
  first: readonly Reply[],
  second: readonly Reply[],
  over: Partial<AiTurnDeps>,
  isGuest = true,
) => {
  const one = scriptedModel(first);
  const proposed = await read(
    await createAiTurn(fakeDeps(world, one.model, over))(
      textTurn(world, "m1", "please do it"),
    ),
  );
  world.history.push(await asMessage("a1", proposed));
  const two = scriptedModel(second);
  const chunks = await read(
    await createAiTurn(fakeDeps(world, two.model, over))({
      ...approvalTurn(world, "m2", approvalOf(proposed)[0] ?? "missing", true),
      isGuest,
      ip: "1.2.3.4",
    }),
  );
  return { chunks, calls: two.calls };
};

describe("guest guards at Approve (spec 0008, AC-2, AC-4)", () => {
  const start = {
    calls: [{ toolName: "startRun", input: { toolId: "sample" } }],
  };
  const restart = {
    calls: [{ toolName: "restartRun", input: { previousRunId: OLD } }],
  };

  it("a guest's approved start takes one run with their IP, and keeps it", async () => {
    const world = makeWorld();
    const { state, limits } = fakeLimits();
    await tapAs(world, [start], [{ text: "Started." }], { limits });
    expect(world.started).toEqual([{ toolId: "sample", price: 5 }]);
    expect(state).toEqual({ taken: 1, givenBack: 0, ips: ["1.2.3.4"] });
  });

  it("over the daily runs, nothing is held and the runs card follows a short reply", async () => {
    const world = makeWorld();
    const { limits } = fakeLimits({ max: 0 });
    const { chunks, calls } = await tapAs(
      world,
      [start],
      [{ text: "Sorry about that." }],
      { limits },
    );
    expect(world.started).toEqual([]);
    expect(seen(calls)).toContain("run_limit");
    expect(dataOf(chunks)).toEqual([
      { type: "data-error", data: { kind: "runs_daily", retry: false } },
    ]);
  });

  it("with the spend cap tripped, nothing is held or counted and the spend card shows", async () => {
    const world = makeWorld();
    const { state, limits } = fakeLimits({ capped: true });
    const { chunks } = await tapAs(world, [start], [{ text: "Sorry." }], {
      limits,
    });
    expect(world.started).toEqual([]);
    expect(state.taken).toBe(0);
    expect(dataOf(chunks)).toEqual([
      { type: "data-error", data: { kind: "spend_cap", retry: false } },
    ]);
  });

  it("a failed hold gives the run back", async () => {
    const world = makeWorld();
    const { state, limits } = fakeLimits();
    await tapAs(world, [start], [{ text: "You need more credits." }], {
      limits,
      startRunWithHold: async () =>
        err({ code: "insufficient_credits", available: 2 }),
    });
    expect(state).toMatchObject({ taken: 1, givenBack: 1 });
  });

  it("a hold that throws gives the run back too", async () => {
    const world = makeWorld();
    const { state, limits } = fakeLimits();
    await tapAs(world, [start], [{ text: "That failed." }], {
      limits,
      startRunWithHold: async () => {
        throw new Error("db down");
      },
    });
    expect(state).toMatchObject({ taken: 1, givenBack: 1 });
  });

  it("a signed in user is never checked or counted", async () => {
    const world = makeWorld();
    const { state, limits } = fakeLimits({ max: 0, capped: true });
    await tapAs(world, [start], [{ text: "Started." }], { limits }, false);
    expect(world.started).toEqual([{ toolId: "sample", price: 5 }]);
    expect(state.ips).toEqual([]);
  });

  it("a restart counts as a new run, and is refused over the limit", async () => {
    const counted = makeWorld({
      quotes: { [OLD]: quote({ status: "completed" }) },
    });
    const one = fakeLimits();
    await tapAs(counted, [restart], [{ text: "Restarted." }], {
      limits: one.limits,
    });
    expect(counted.restarted).toHaveLength(1);
    expect(one.state.taken).toBe(1);

    const refused = makeWorld({
      quotes: { [OLD]: quote({ status: "completed" }) },
    });
    const none = fakeLimits({ max: 0 });
    const { chunks } = await tapAs(refused, [restart], [{ text: "Sorry." }], {
      limits: none.limits,
    });
    expect(refused.restarted).toEqual([]);
    expect(dataOf(chunks)).toContainEqual({
      type: "data-error",
      data: { kind: "runs_daily", retry: false },
    });
  });

  it("a resume is never limited or counted", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote({ heldAmount: null }) } });
    const { state, limits } = fakeLimits({ max: 0, capped: true });
    await tapAs(
      world,
      [{ calls: [{ toolName: "resumeRun", input: { runId: RUN } }] }],
      [{ text: "Back." }],
      { limits },
    );
    expect(world.resumed).toEqual([{ runId: RUN, price: 5 }]);
    expect(state.ips).toEqual([]);
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

// ---------------------------------------------------------------------------
// AC-3, AC-9: resume, stop and restart with server written fields
// ---------------------------------------------------------------------------

const USER2 = "0190a000-0000-7000-8000-0000000000u2";
const OLD = "0190a000-0000-7000-8000-000000000009";

/** One typed turn, then (when given) the approval tap and its continuation. */
const proposeAndTap = async (
  world: World,
  first: readonly Reply[],
  second: readonly Reply[] | null,
  over: Partial<AiTurnDeps> = {},
  approved = true,
) => {
  const one = scriptedModel(first);
  const proposed = await read(
    await createAiTurn(fakeDeps(world, one.model, over))(
      textTurn(world, "m1", "please do it"),
    ),
  );
  if (second === null) return { proposed, chunks: proposed, calls: one.calls };
  world.history.push(await asMessage("a1", proposed));
  const two = scriptedModel(second);
  const chunks = await read(
    await createAiTurn(fakeDeps(world, two.model, over))(
      approvalTurn(world, "m2", approvalOf(proposed)[0] ?? "missing", approved),
    ),
  );
  return { proposed, chunks, calls: two.calls };
};

/** Every prompt the model saw (tool results included), as one string. */
const seen = (calls: readonly { prompt: unknown }[]) =>
  calls.map((c) => JSON.stringify(c.prompt)).join("\n");

describe("resumeRun (AC-3, AC-9)", () => {
  const resume = { calls: [{ toolName: "resumeRun", input: { runId: RUN } }] };

  it("a run that still holds its credits resumes with no card, then the open card", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote({ heldAmount: 5 }) } });
    const { chunks } = await proposeAndTap(
      world,
      [resume, { text: "Back." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(inputOf(chunks, "resumeRun")[0]).toEqual({ runId: RUN });
    expect(world.resumed).toEqual([{ runId: RUN, price: null }]);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });

  it("a run whose hold was released shows a card at the tool's price, and approving holds it", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote() } });
    const { proposed, chunks } = await proposeAndTap(
      world,
      [resume],
      [{ text: "Back." }],
    );
    expect(inputOf(proposed, "resumeRun")[0]).toEqual({
      runId: RUN,
      shownPrice: 5,
      availableBalance: 30,
    });
    expect(approvalOf(proposed)).toHaveLength(1);
    expect(world.resumed).toEqual([{ runId: RUN, price: 5 }]);
    expect(dataOf(chunks)).toContainEqual(
      expect.objectContaining({ type: "data-question" }),
    );
  });

  it("a hold placed between card and tap turns the approval down, and the next call resumes free", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote() } });
    const one = scriptedModel([resume]);
    const proposed = await read(
      await createAiTurn(fakeDeps(world, one.model))(
        textTurn(world, "m1", "continue"),
      ),
    );
    world.history.push(await asMessage("a1", proposed));
    world.quotes[RUN] = quote({ heldAmount: 5 });
    const two = scriptedModel([resume, { text: "Back." }]);
    const chunks = await read(
      await createAiTurn(fakeDeps(world, two.model))(
        approvalTurn(world, "m2", approvalOf(proposed)[0] ?? "", true),
      ),
    );
    expect(seen(two.calls)).toContain("does not match");
    expect(approvalOf(chunks)).toEqual([]);
    expect(world.resumed).toEqual([{ runId: RUN, price: null }]);
  });

  it("a hold found at execute with a price on the card resumes free", async () => {
    // Refinement on the card, refinement on the tap, then execute's own read.
    const world = makeWorld({
      quotes: { [RUN]: [quote(), quote(), quote({ heldAmount: 5 })] },
    });
    await proposeAndTap(world, [resume], [{ text: "Back." }]);
    expect(world.resumed).toEqual([{ runId: RUN, price: null }]);
  });

  it("a failed refinement read shows no card, and execute holds nothing without one", async () => {
    const world = makeWorld({ quotes: { [RUN]: ["throw", quote()] } });
    const { chunks, calls } = await proposeAndTap(
      world,
      [resume, { text: "Try again." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("approval_required");
    expect(world.resumed).toEqual([]);
  });

  it("a paused run on an old tool version returns version_changed", async () => {
    const world = makeWorld({
      quotes: { [RUN]: quote({ toolVersion: "1", heldAmount: 5 }) },
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [resume, { text: "That tool changed." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("version_changed");
    expect(world.resumed).toEqual([]);
  });

  it("a run of another chat is not found", async () => {
    const world = makeWorld({
      quotes: { [RUN]: quote({ conversationId: "other" }) },
    });
    const { calls } = await proposeAndTap(world, [resume, { text: "?" }], null);
    expect(seen(calls)).toContain("not_found");
    expect(world.resumed).toEqual([]);
  });

  it("a guest link before the read retries it as the new owner", async () => {
    const world = makeWorld();
    const owners: string[] = [];
    const over: Partial<AiTurnDeps> = {
      ownerOf: async () => ok(USER2),
      runQuote: async (ownerId) => {
        owners.push(ownerId);
        return ownerId === USER2
          ? ok(quote({ heldAmount: 5 }))
          : err({ code: "not_found" });
      },
      resumeRun: async (ownerId, runId) => {
        owners.push(`resume:${ownerId}`);
        world.resumed.push({ runId, price: null });
        return ok({ runId });
      },
    };
    await proposeAndTap(world, [resume, { text: "Back." }], null, over);
    expect(owners).toContain(USER2);
    expect(owners).toContain(`resume:${USER2}`);
    expect(world.resumed).toHaveLength(1);
  });
});

describe("stopRun (AC-9)", () => {
  const stop = { calls: [{ toolName: "stopRun", input: { runId: RUN } }] };

  it("the card carries the held amount; approving stops the run and shows no card", async () => {
    const world = makeWorld({
      answers: [],
      quotes: { [RUN]: quote({ status: "in_progress", heldAmount: 30 }) },
    });
    const { proposed, chunks } = await proposeAndTap(
      world,
      [stop],
      [{ text: "Stopped." }],
    );
    expect(inputOf(proposed, "stopRun")[0]).toEqual({
      runId: RUN,
      heldAmount: 30,
    });
    expect(world.stopped).toEqual([RUN]);
    expect(dataOf(chunks)).toEqual([]);
  });

  it("a run with no hold still asks, with 0 credits to return", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote() } });
    const { proposed } = await proposeAndTap(world, [stop], [{ text: "Ok." }]);
    expect(inputOf(proposed, "stopRun")[0]).toEqual({
      runId: RUN,
      heldAmount: 0,
    });
    expect(approvalOf(proposed)).toHaveLength(1);
  });

  it("a declined card stops nothing", async () => {
    const world = makeWorld({ quotes: { [RUN]: quote() } });
    await proposeAndTap(world, [stop], [{ text: "Kept." }], {}, false);
    expect(world.stopped).toEqual([]);
  });

  it("a completed run shows no card and says already_completed", async () => {
    const world = makeWorld({
      quotes: { [RUN]: quote({ status: "completed" }) },
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [stop, { text: "It's done." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("already_completed");
    expect(world.stopped).toEqual([]);
  });

  it("a failed read shows no card and changes nothing", async () => {
    const world = makeWorld({ quotes: { [RUN]: ["throw", quote()] } });
    const { chunks, calls } = await proposeAndTap(
      world,
      [stop, { text: "Try again." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("try_again");
    expect(world.stopped).toEqual([]);
  });
});

describe("restartRun (AC-5b, AC-9)", () => {
  const restart = {
    calls: [{ toolName: "restartRun", input: { previousRunId: OLD } }],
  };

  it("a completed run restarts at today's price with the answers copied, then the asked card opens", async () => {
    const world = makeWorld({
      quotes: { [OLD]: quote({ status: "completed" }) },
    });
    const { proposed, chunks } = await proposeAndTap(
      world,
      [restart],
      [
        {
          calls: [
            {
              toolName: "showQuestion",
              input: { runId: RUN, questionId: "channels" },
            },
          ],
        },
        { text: "Change it here." },
      ],
    );
    expect(inputOf(proposed, "restartRun")[0]).toEqual({
      previousRunId: OLD,
      shownPrice: 5,
      availableBalance: 30,
    });
    expect(world.restarted).toEqual([
      { previousRunId: OLD, version: "2", price: 5 },
    ]);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ questionId: "channels" }),
      }),
    ]);
  });

  it("after a version change, a fresh run starts and the old answers are offered with their sources", async () => {
    const world = makeWorld({
      quotes: { [OLD]: quote({ status: "completed", toolVersion: "1" }) },
      startFromError: { code: "version_changed" },
      oldAnswers: [
        { questionId: "stage", value: "idea", source: "client" },
        { questionId: "channels", value: ["market"], source: "profile" },
        { questionId: "team_size", value: 13, source: "client" },
        { questionId: "monthly_sales", value: 10, source: "client" },
      ],
    });
    const { chunks } = await proposeAndTap(
      world,
      [restart],
      [{ text: "The tool changed; check these." }],
    );
    expect(world.started).toEqual([{ toolId: "sample", price: 5 }]);
    // 13 fails the tool's refine; monthly_sales is hidden for "idea".
    expect(dataOf(chunks)).toEqual([
      {
        type: "data-prefill",
        data: {
          runId: RUN,
          title: "From your last run",
          items: [
            expect.objectContaining({
              questionId: "stage",
              value: "idea",
              source: "client",
            }),
            expect.objectContaining({
              questionId: "channels",
              value: ["market"],
              source: "profile",
            }),
          ],
        },
      },
    ]);
  });

  it("a saveAnswer in the turn a version change restart starts saves nothing, and the old answers are offered", async () => {
    // covers: AC-5b
    const world = makeWorld({
      quotes: { [OLD]: quote({ status: "completed", toolVersion: "1" }) },
      startFromError: { code: "version_changed" },
      oldAnswers: [{ questionId: "stage", value: "idea", source: "client" }],
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [restart],
      [
        {
          calls: [
            {
              toolName: "saveAnswer",
              input: { runId: RUN, questionId: "stage", value: "growing" },
            },
          ],
        },
        { text: "Check these." },
      ],
    );
    expect(world.saved).toEqual([]);
    expect(seen(calls)).toContain("run_just_started");
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-prefill",
        data: expect.objectContaining({
          title: "From your last run",
          items: [
            expect.objectContaining({ questionId: "stage", value: "idea" }),
          ],
        }),
      }),
    ]);
  });

  it("a saveAnswer in the turn a copy restart starts saves nothing, and the asked card opens", async () => {
    // covers: AC-9 (the changed answer goes through the reopened card)
    const world = makeWorld({
      quotes: { [OLD]: quote({ status: "completed" }) },
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [restart],
      [
        {
          calls: [
            {
              toolName: "saveAnswer",
              input: { runId: RUN, questionId: "channels", value: ["online"] },
            },
            {
              toolName: "showQuestion",
              input: { runId: RUN, questionId: "channels" },
            },
          ],
        },
        { text: "Change it here." },
      ],
    );
    expect(world.saved).toEqual([]);
    expect(seen(calls)).toContain("run_just_started");
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ questionId: "channels" }),
      }),
    ]);
  });

  it("an unknown previous run shows no card and is not found", async () => {
    const world = makeWorld();
    const { chunks, calls } = await proposeAndTap(
      world,
      [restart, { text: "Can't find it." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("not_found");
    expect(world.restarted).toEqual([]);
  });

  it("a failed read shows no card and holds nothing", async () => {
    const world = makeWorld({
      quotes: { [OLD]: ["throw", quote({ status: "completed" })] },
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [restart, { text: "Try again." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("try_again");
    expect(world.restarted).toEqual([]);
  });

  it("a run that isn't completed yet shows no card", async () => {
    const world = makeWorld({
      quotes: { [OLD]: quote({ status: "in_progress" }) },
    });
    const { chunks, calls } = await proposeAndTap(
      world,
      [restart, { text: "Not done yet." }],
      null,
    );
    expect(approvalOf(chunks)).toEqual([]);
    expect(seen(calls)).toContain("previous_not_completed");
  });
});

// ---------------------------------------------------------------------------
// AC-5: known facts on the prefill card
// ---------------------------------------------------------------------------

const helperReplying = (text: string | Error) => {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      if (text instanceof Error) throw text;
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return {
    prompts,
    helperModel: () => ({
      id: "mock-helper",
      model,
      providerOptions: { anthropic: { effort: "low" as const } },
    }),
  };
};

describe("known facts extraction (AC-5)", () => {
  const LONG =
    "I sell zobo on WhatsApp and Instagram to offices in Lekki, still just an idea really";

  const startAndApprove = async (
    world: World,
    text: string,
    helper: ReturnType<typeof helperReplying>,
    after: readonly Reply[] = [{ text: "Started." }],
  ) => {
    const first = scriptedModel([
      { calls: [{ toolName: "startRun", input: { toolId: "sample" } }] },
    ]);
    const proposed = await read(
      await createAiTurn(fakeDeps(world, first.model))(
        textTurn(world, "m1", text),
      ),
    );
    world.history.push(await asMessage("a1", proposed));
    const second = scriptedModel(after);
    return read(
      await createAiTurn(
        fakeDeps(world, second.model, { helperModel: helper.helperModel }),
      )(approvalTurn(world, "m2", approvalOf(proposed)[0] ?? "", true)),
    );
  };

  it("lists only valid, visible proposals on the prefill card and records usage", async () => {
    const world = makeWorld();
    const helper = helperReplying(
      JSON.stringify({
        answers: [
          { questionId: "stage", value: "idea" },
          { questionId: "channels", value: ["whatsapp", "instagram"] },
          { questionId: "team_size", value: 13 },
          { questionId: "monthly_sales", value: 50000 },
        ],
      }),
    );
    const chunks = await startAndApprove(world, LONG, helper);
    expect(dataOf(chunks)).toEqual([
      {
        type: "data-prefill",
        data: {
          runId: RUN,
          title: "From our chat",
          items: [
            {
              questionId: "stage",
              prompt: "Where are you?",
              value: "idea",
              label: "Just an idea",
              source: "chat",
            },
            {
              questionId: "channels",
              prompt: "Where do you sell?",
              value: ["whatsapp", "instagram"],
              label: "WhatsApp, Instagram",
              source: "chat",
            },
          ],
        },
      },
    ]);
    expect(world.saved).toEqual([]);
    expect(world.usage).toEqual([
      expect.objectContaining({
        callKey: `${RUN}:extraction`,
        purpose: "extraction",
        runId: RUN,
      }),
    ]);
    // Client text goes in the fenced data block.
    expect(helper.prompts[0]).toContain("<client_data>");
  });

  it("a saveAnswer in the turn the run starts saves nothing, and the prefill card shows", async () => {
    // covers: AC-5 (nothing from the chat is saved without the client's confirmation)
    const world = makeWorld();
    const helper = helperReplying(
      JSON.stringify({ answers: [{ questionId: "stage", value: "idea" }] }),
    );
    const chunks = await startAndApprove(world, LONG, helper, [
      {
        calls: [
          {
            toolName: "saveAnswer",
            input: { runId: RUN, questionId: "stage", value: "idea" },
          },
        ],
      },
      { text: "Started." },
    ]);
    // Facts from earlier chat are saved only after the client confirms them.
    expect(world.saved).toEqual([]);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-prefill",
        data: expect.objectContaining({
          items: [expect.objectContaining({ questionId: "stage" })],
        }),
      }),
    ]);
    expect(world.logs).toContainEqual({
      event: "assistant_tool",
      fields: { name: "saveAnswer", outcome: "run_just_started" },
    });
  });

  it("skips the call for short client text and shows the first card", async () => {
    const world = makeWorld();
    const helper = helperReplying(JSON.stringify({ answers: [] }));
    const chunks = await startAndApprove(world, "an idea", helper);
    expect(helper.prompts).toEqual([]);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });

  it("a failing helper falls back to the first card", async () => {
    const world = makeWorld();
    const helper = helperReplying(new Error("timeout"));
    const chunks = await startAndApprove(world, LONG, helper);
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({ type: "data-question" }),
    ]);
    expect(world.logs).toContainEqual({
      event: "assistant_extract",
      fields: expect.objectContaining({ failed: true }),
    });
  });
});

describe("sumUsage (spec 0007, step 6)", () => {
  const step = (
    modelId: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokenDetails?: {
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      };
    },
  ) => ({ usage, response: { modelId } });

  it("is null when no step ran", () => {
    expect(sumUsage([])).toBeNull();
  });

  it("adds every step, counts a missing number as 0, and names the last step's model", () => {
    expect(
      sumUsage([
        step("claude-opus-5-5", {
          inputTokens: 100,
          outputTokens: 10,
          inputTokenDetails: { cacheReadTokens: 80 },
        }),
        step("fallback-model", {
          inputTokens: 50,
          inputTokenDetails: { cacheWriteTokens: 5 },
        }),
      ]),
    ).toEqual({
      model: "fallback-model",
      inputTokens: 150,
      outputTokens: 10,
      cacheReadTokens: 80,
      cacheWriteTokens: 5,
    });
  });
});

describe("createAiTurn: usage", () => {
  it("settles to the turn's totals once the stream ends", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([{ text: "Hi there." }]);
    const turn = await createAiTurn(fakeDeps(world, model))(
      textTurn(world, "m1", "hello"),
    );
    await read(turn);
    expect(await turn.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it("settles to null when the chat can't be opened (no model call)", async () => {
    const world = makeWorld();
    const { model } = scriptedModel([]);
    const turn = await createAiTurn({
      ...fakeDeps(world, model),
      openChat: async () => err({ code: "not_found" }),
    })(textTurn(world, "m1", "hello"));
    expect(await turn.usage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 0012: business profile facts on the prefill card
// ---------------------------------------------------------------------------

describe("profile facts on the prefill card (spec 0012, AC-6, AC-7)", () => {
  const linked: ToolModule = {
    ...sampleTool,
    questions: sampleTool.questions.map((q) =>
      q.id === "stage"
        ? {
            ...q,
            fact: {
              key: "business_model",
              toFact: () => "b2c",
              fromFact: (fact: unknown) => (fact === "b2c" ? "idea" : null),
            },
          }
        : q,
    ),
  };
  const getTool = (id: string) =>
    id === "sample" ? ok(linked) : registry.getTool(id);

  it("offers a mapped profile fact, then saves it with source profile", async () => {
    const world = makeWorld({
      profile: [{ key: "business_model", value: "b2c" }],
    });
    const { proposed, chunks } = await proposeAndTap(
      world,
      [{ calls: [{ toolName: "startRun", input: { toolId: "sample" } }] }],
      [{ text: "Started." }],
      { getTool },
    );
    expect(approvalOf(proposed)).toHaveLength(1);
    expect(dataOf(chunks)).toEqual([
      {
        type: "data-prefill",
        data: {
          runId: RUN,
          title: "From your profile",
          items: [
            expect.objectContaining({
              questionId: "stage",
              value: "idea",
              source: "profile",
            }),
          ],
        },
      },
    ]);
  });

  it("shows the first card when the profile has nothing that maps", async () => {
    const world = makeWorld({
      profile: [{ key: "business_model", value: "b2b" }],
    });
    const { chunks } = await proposeAndTap(
      world,
      [{ calls: [{ toolName: "startRun", input: { toolId: "sample" } }] }],
      [{ text: "Started." }],
      { getTool },
    );
    expect(dataOf(chunks)).toEqual([
      expect.objectContaining({
        type: "data-question",
        data: expect.objectContaining({ questionId: "stage" }),
      }),
    ]);
  });
});
