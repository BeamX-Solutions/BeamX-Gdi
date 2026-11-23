import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import type { ReportError } from "@/db/queries/reports";
import type { UsageInput } from "@/db/queries/usage";
import { makeRegistry } from "@/tools/_kit/registry";
import { stellar } from "@/tools/stellar";
import { threePhaseTool } from "@/tools/test-tools/three-phase";
import type { ToolModule } from "@/tools/registry";
import { err, ok } from "@/lib/result";
import { providerErrorKind, runReport, type RunnerDeps } from "./report-runner";

// Spec 0005, AC-8, AC-9, AC-12: the runner with the AI SDK mock model and an in
// memory report row.

const RUN = "00000000-0000-7000-8000-000000000001";
const OWNER = "00000000-0000-7000-8000-000000000002";

type Reply =
  | { readonly text: string; readonly inputTokens?: number }
  | { readonly throws: unknown }
  | { readonly hang: true };

const usage = (input: number, output: number) => ({
  inputTokens: {
    total: input,
    noCache: input,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

/** A mock model that answers from a script, one reply per call, and keeps each prompt. */
const scriptedModel = (replies: readonly Reply[]) => {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const reply = replies[prompts.length - 1] ?? replies.at(-1);
      if (!reply) throw new Error("no reply scripted");
      if ("throws" in reply) throw reply.throws;
      if ("hang" in reply) {
        await new Promise((_, reject) => {
          options.abortSignal?.addEventListener("abort", () =>
            reject(options.abortSignal?.reason),
          );
        });
      }
      const text = "text" in reply ? reply.text : "";
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: usage("text" in reply ? (reply.inputTokens ?? 100) : 0, 50),
        warnings: [],
      };
    },
  });
  return { model, prompts };
};

type Row = {
  status: "pending" | "generating" | "ready" | "failed";
  attempts: number;
  content: Record<string, unknown> | null;
  error: ReportError | null;
  hold: boolean;
  charged: boolean;
};

type Setup = {
  readonly tool?: ToolModule;
  readonly replies: readonly Reply[];
  readonly answers?: readonly { questionId: string; value: unknown }[];
  readonly scores?: unknown;
  readonly content?: Record<string, unknown> | null;
  readonly attempts?: number;
  readonly hold?: boolean;
  readonly spendCap?: boolean;
  /** The run owner's first name (null, a guest, by default). */
  readonly firstName?: string | null;
  /** Runs before each status check; lets a test steal the attempt mid run. */
  readonly onStatus?: (row: Row, checks: number) => void;
};

const stellarAnswers = [
  { questionId: "foundation", value: "all-three" },
  {
    questionId: "value_creation",
    value: "Fresh bread delivered daily to offices.",
  },
  { questionId: "market_validation", value: "yes-confirmed" },
  { questionId: "investment", value: "under-100" },
  { questionId: "skills", value: "yes-regularly" },
  { questionId: "speed", value: "yes-ready" },
  { questionId: "passion_market_fit", value: "both" },
  { questionId: "competitors", value: "Two bakeries nearby" },
  { questionId: "learning", value: "start-imperfect" },
  { questionId: "commitment", value: "maybe" },
];

const stellarScores = (): unknown => {
  const scored = stellar.score(
    Object.fromEntries(stellarAnswers.map((a) => [a.questionId, a.value])),
  );
  if (!scored.ok) throw new Error("fixture answers are incomplete");
  return scored.value;
};

/** The three phase tool cut down to its first phase, with a content schema to match. */
const onePhaseTool: ToolModule = {
  ...threePhaseTool,
  contentSchema: z.object({ one: z.object({ text: z.string() }) }),
  phases: threePhaseTool.phases.slice(0, 1),
};

const analysis = {
  strengths: ["Clear offer"],
  gaps: ["No pricing yet"],
  personalizedPlan: "Start small.\n\nGrow from there.",
  weeklyRoadmap: [{ week: 1, tasks: ["Bake samples"] }],
  resources: [{ title: "Guide", description: "Helps", link: null }],
  riskAssessment: "Low risk.",
};

const setup = (s: Setup) => {
  const tool = s.tool ?? threePhaseTool;
  const registry = makeRegistry([tool]);
  const row: Row = {
    status: "generating",
    attempts: s.attempts ?? 1,
    content: s.content ?? null,
    error: null,
    hold: s.hold ?? true,
    charged: false,
  };
  const usageRows: UsageInput[] = [];
  const logs: { event: string; fields: Record<string, unknown> }[] = [];
  const { model, prompts } = scriptedModel(s.replies);
  let statusChecks = 0;
  let readyModel: string | null = null;

  const deps: RunnerDeps = {
    getTool: registry.getTool,
    ownerOf: async () => ok({ userId: OWNER, firstName: s.firstName ?? null }),
    getRun: async () =>
      ok({
        run: {
          toolId: tool.id,
          toolVersion: tool.version,
          scores: s.scores ?? {},
        },
        answers: s.answers ?? [{ questionId: "goal", value: "grow" }],
        report: { content: row.content },
      }),
    reportStatus: async () => {
      statusChecks += 1;
      s.onStatus?.(row, statusChecks);
      return ok({ status: row.status, attempts: row.attempts });
    },
    savePhase: async (_run, attempt, key, output) => {
      if (row.status !== "generating" || row.attempts !== attempt)
        return err({ code: "stale_attempt" });
      row.content = { ...(row.content ?? {}), [key]: output };
      return ok(undefined);
    },
    markReady: async (_run, attempt, content, modelId) => {
      if (row.status !== "generating" || row.attempts !== attempt)
        return err({ code: "stale_attempt" });
      if (!row.hold) {
        row.status = "failed";
        return err({ code: "no_credit_hold" });
      }
      row.status = "ready";
      row.content = content as Record<string, unknown>;
      row.charged = true;
      row.hold = false;
      readyModel = modelId;
      return ok(row);
    },
    markFailed: async (_run, attempt, error) => {
      if (row.status !== "generating" || row.attempts !== attempt)
        return err({ code: "stale_attempt" });
      row.status = "failed";
      row.error = error;
      if (row.attempts >= 3) row.hold = false;
      return ok(row);
    },
    recordUsage: async (input) => {
      if (!usageRows.some((u) => u.callKey === input.callKey))
        usageRows.push(input);
      return { status: "recorded" };
    },
    checkSpendCap: async () =>
      s.spendCap === false ? err({ code: "spend_cap" }) : ok(undefined),
    model: () => ({ id: "claude-opus-5-5", model }),
    now: () => 0,
    log: (event, fields) => logs.push({ event, fields }),
  };

  /** A retry: the next claim bumps the attempt and keeps saved content. */
  const reclaim = () => {
    row.status = "generating";
    row.attempts += 1;
    row.error = null;
  };

  return {
    deps,
    row,
    prompts,
    usageRows,
    logs,
    reclaim,
    readyModel: () => readyModel,
  };
};

const step = (text: string) => JSON.stringify({ text });

describe("runReport, happy path (AC-8, AC-12)", () => {
  it("runs Stellar's phase, marks ready with the content and charges once", async () => {
    const t = setup({
      tool: stellar,
      answers: stellarAnswers,
      scores: stellarScores(),
      replies: [{ text: JSON.stringify(analysis), inputTokens: 1000 }],
    });

    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "ready",
    });
    expect(t.row).toMatchObject({ status: "ready", charged: true });
    expect(t.row.content).toEqual({ analysis });
    expect(t.readyModel()).toBe("claude-opus-5-5");

    // The answers reach the model inside the fenced data block.
    expect(t.prompts[0]).toContain("<client_data>");
    expect(t.prompts[0]).toContain("Fresh bread delivered daily to offices.");

    expect(t.usageRows).toEqual([
      {
        callKey: `report:${RUN}:1:analysis:1`,
        userId: OWNER,
        runId: RUN,
        purpose: "report",
        model: "claude-opus-5-5",
        inputTokens: 1000,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: "0.005000",
      },
    ]);
  });

  it("runs phases in order, each seeing the outputs before it", async () => {
    const t = setup({
      replies: [{ text: step("A") }, { text: step("B") }, { text: step("C") }],
    });
    expect((await runReport(t.deps, { runId: RUN, attempt: 1 })).outcome).toBe(
      "ready",
    );
    expect(t.prompts).toHaveLength(3);
    expect(t.prompts[1]).toContain('\\"one\\":{\\"text\\":\\"A\\"}');
    expect(t.prompts[2]).toContain('\\"two\\":{\\"text\\":\\"B\\"}');
    expect(t.row.content).toEqual({
      one: { text: "A" },
      two: { text: "B" },
      three: { text: "C" },
    });
  });
});

describe("runReport, resume (AC-8)", () => {
  it("a retry skips saved phases and the next phase sees their output", async () => {
    const overloaded = new APICallError({
      message: "Overloaded",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 529,
      isRetryable: false,
    });
    const t = setup({
      replies: [
        { text: step("A") },
        { throws: overloaded },
        { text: step("B") },
        { text: step("C") },
      ],
    });

    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "provider_overloaded",
    });
    expect(t.row.content).toEqual({ one: { text: "A" } });
    expect(t.prompts).toHaveLength(2);

    t.reclaim();
    expect((await runReport(t.deps, { runId: RUN, attempt: 2 })).outcome).toBe(
      "ready",
    );
    // Phase one was not called again: two more calls, for phases two and three.
    expect(t.prompts).toHaveLength(4);
    expect(t.prompts[2]).toContain("Phase two");
    expect(t.prompts[2]).toContain('\\"text\\":\\"A\\"');
  });

  it("runs a saved phase again when its output no longer parses", async () => {
    const t = setup({
      content: { one: { wrong: true } },
      replies: [{ text: step("A") }, { text: step("B") }, { text: step("C") }],
    });
    expect((await runReport(t.deps, { runId: RUN, attempt: 1 })).outcome).toBe(
      "ready",
    );
    expect(t.prompts).toHaveLength(3);
    expect(t.row.content).toMatchObject({ one: { text: "A" } });
  });
});

describe("runReport, bad output (AC-9, AC-12)", () => {
  it("repairs one invalid output and records both calls", async () => {
    const t = setup({
      tool: onePhaseTool,
      replies: [{ text: JSON.stringify({ text: 42 }) }, { text: step("A") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "ready",
    });
    expect(t.prompts).toHaveLength(2);
    expect(t.prompts[1]).toContain("did not match the required format");
    expect(t.usageRows.map((u) => u.callKey)).toEqual([
      `report:${RUN}:1:one:1`,
      `report:${RUN}:1:one:2`,
    ]);
    expect(t.logs.map((l) => l.event)).toContain("report_phase_repair");
  });

  it("ends ready after invalid then valid output", async () => {
    const t = setup({
      replies: [
        { text: "not json" },
        { text: step("A") },
        { text: step("B") },
        { text: step("C") },
      ],
    });
    expect((await runReport(t.deps, { runId: RUN, attempt: 1 })).outcome).toBe(
      "ready",
    );
    expect(t.usageRows).toHaveLength(4);
  });

  it("fails with invalid_output after two invalid outputs", async () => {
    const t = setup({ replies: [{ text: "{}" }, { text: "{}" }] });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "invalid_output",
    });
    expect(t.row.error?.kind).toBe("invalid_output");
    expect(t.usageRows).toHaveLength(2);
  });

  it("the third failed attempt releases the hold", async () => {
    const t = setup({ attempts: 3, replies: [{ text: "{}" }] });
    await runReport(t.deps, { runId: RUN, attempt: 3 });
    expect(t.row).toMatchObject({
      status: "failed",
      hold: false,
      charged: false,
    });
  });
});

describe("runReport, failures (AC-9, AC-12)", () => {
  it("refuses at the spend cap with no model call", async () => {
    const t = setup({ spendCap: false, replies: [{ text: step("A") }] });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "spend_cap",
    });
    expect(t.prompts).toHaveLength(0);
    expect(t.usageRows).toHaveLength(0);
  });

  it("maps a phase timeout to timeout and records nothing", async () => {
    const tool: ToolModule = {
      ...threePhaseTool,
      phases: threePhaseTool.phases.map((p) => ({ ...p, timeoutMs: 20 })),
    };
    const t = setup({ tool, replies: [{ hang: true }] });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "timeout",
    });
    expect(t.usageRows).toHaveLength(0);
  });

  it("a non provider error from the model ends failed with unknown", async () => {
    const t = setup({ replies: [{ throws: new Error("boom") }] });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "unknown",
    });
    expect(t.row.status).toBe("failed");
  });

  it("a crash anywhere in the runner ends failed with unknown, never generating", async () => {
    const t = setup({ replies: [{ text: step("A") }] });
    const deps: RunnerDeps = {
      ...t.deps,
      savePhase: async () => {
        throw new Error("db down");
      },
    };
    expect(await runReport(deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "unknown",
    });
    expect(t.row.status).toBe("failed");
    expect(t.logs.map((l) => l.event)).toContain("report_crashed");
  });

  it("stored answers that no longer parse fail with unknown", async () => {
    const t = setup({
      answers: [{ questionId: "goal", value: "fly" }],
      replies: [{ text: step("A") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "unknown",
    });
    expect(t.prompts).toHaveLength(0);
    expect(t.logs.map((l) => l.event)).toContain("report_stored_data_invalid");
  });

  it("a gone hold at the end fails the report with no_credit_hold", async () => {
    const t = setup({
      hold: false,
      replies: [{ text: step("A") }, { text: step("B") }, { text: step("C") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "no_credit_hold",
    });
    expect(t.row.charged).toBe(false);
  });
});

describe("runReport, overlap (AC-7, AC-12)", () => {
  it("stops before the next phase once a newer attempt owns the report", async () => {
    const t = setup({
      replies: [{ text: step("A") }, { text: step("B") }, { text: step("C") }],
      // The second check (before phase two) sees a stale reclaim.
      onStatus: (row, checks) => {
        if (checks === 2) row.attempts = 2;
      },
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "stopped",
      reason: "stale_attempt",
    });
    expect(t.prompts).toHaveLength(1);
    // The newer attempt is untouched: not failed by the old runner.
    expect(t.row.status).toBe("generating");
  });
});

describe("providerErrorKind (AC-9)", () => {
  const apiError = (statusCode: number) =>
    new APICallError({
      message: "x",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode,
    });

  it("maps overloaded and rate limited to provider_overloaded", () => {
    expect(providerErrorKind(apiError(529))).toBe("provider_overloaded");
    expect(providerErrorKind(apiError(429))).toBe("provider_overloaded");
    expect(providerErrorKind(apiError(503))).toBe("provider_overloaded");
  });

  it("maps other API errors to unknown", () => {
    expect(providerErrorKind(apiError(400))).toBe("unknown");
    expect(providerErrorKind(new Error("x"))).toBe("unknown");
  });

  it("looks inside a retry error, and treats an abort as timeout", () => {
    expect(
      providerErrorKind(
        new RetryError({
          message: "x",
          reason: "maxRetriesExceeded",
          errors: [apiError(529)],
        }),
      ),
    ).toBe("provider_overloaded");
    expect(
      providerErrorKind(
        new RetryError({ message: "x", reason: "abort", errors: [] }),
      ),
    ).toBe("timeout");
    expect(
      providerErrorKind(
        new DOMException("The operation timed out.", "TimeoutError"),
      ),
    ).toBe("timeout");
  });
});

describe("runReport, phase check and client (spec 0010, AC-7, AC-8)", () => {
  const firstPhase = onePhaseTool.phases[0];
  if (!firstPhase) throw new Error("onePhaseTool has no phase");
  const checks: { output: unknown; firstName: string | null }[] = [];
  /** Accepts any text but "bad", and says hello to the client in its prompt. */
  const checkedTool: ToolModule = {
    ...onePhaseTool,
    phases: [
      {
        ...firstPhase,
        buildPrompt: (ctx) => ({
          instructions: "Write step one.",
          prompt: `Client: ${ctx.client.firstName ?? "none"}`,
        }),
        check: (output, ctx) => {
          checks.push({ output, firstName: ctx.client.firstName });
          const { text } = z.object({ text: z.string() }).parse(output);
          return text === "bad" ? ["Section 1, part 2: the text was bad."] : [];
        },
      },
    ],
  };

  it("passes the owner's first name to the prompt and the check", async () => {
    checks.length = 0;
    const t = setup({
      tool: checkedTool,
      firstName: "Ada",
      replies: [{ text: step("A") }],
    });
    expect((await runReport(t.deps, { runId: RUN, attempt: 1 })).outcome).toBe(
      "ready",
    );
    expect(t.prompts[0]).toContain("Client: Ada");
    expect(checks).toEqual([{ output: { text: "A" }, firstName: "Ada" }]);
  });

  it("gives a guest no first name", async () => {
    const t = setup({ tool: checkedTool, replies: [{ text: step("A") }] });
    await runReport(t.deps, { runId: RUN, attempt: 1 });
    expect(t.prompts[0]).toContain("Client: none");
  });

  it("repairs an output the check rejects, sending its issues", async () => {
    const t = setup({
      tool: checkedTool,
      replies: [{ text: step("bad") }, { text: step("good") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "ready",
    });
    expect(t.prompts).toHaveLength(2);
    expect(t.prompts[1]).toContain("did not match the required format");
    expect(t.prompts[1]).toContain("- Section 1, part 2: the text was bad.");
    expect(t.row.content).toEqual({ one: { text: "good" } });
    expect(t.usageRows.map((u) => u.callKey)).toEqual([
      `report:${RUN}:1:one:1`,
      `report:${RUN}:1:one:2`,
    ]);
    expect(t.logs).toContainEqual({
      event: "report_phase_repair",
      fields: { runId: RUN, attempt: 1, phaseKey: "one", reason: "check" },
    });
  });

  it("fails with invalid_output when the repair is rejected too", async () => {
    const t = setup({
      tool: checkedTool,
      replies: [{ text: step("bad") }, { text: step("bad") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "invalid_output",
    });
    expect(t.usageRows).toHaveLength(2);
    expect(t.row.content).toBeNull();
  });

  it("repairs once across a schema failure then a check failure", async () => {
    const t = setup({
      tool: checkedTool,
      replies: [{ text: "not json" }, { text: step("bad") }],
    });
    expect(await runReport(t.deps, { runId: RUN, attempt: 1 })).toEqual({
      outcome: "failed",
      kind: "invalid_output",
    });
    expect(t.prompts).toHaveLength(2);
  });

  it("skips a saved phase on resume without checking it again", async () => {
    checks.length = 0;
    const t = setup({
      tool: checkedTool,
      content: { one: { text: "bad" } },
      replies: [],
    });
    expect((await runReport(t.deps, { runId: RUN, attempt: 1 })).outcome).toBe(
      "ready",
    );
    expect(t.prompts).toHaveLength(0);
    expect(checks).toHaveLength(0);
  });
});
