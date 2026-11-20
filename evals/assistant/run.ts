/**
 * `pnpm eval:assistant` (spec 0006, AC-15): runs the real model eval set through the
 * real AI turn (instructions, registry tools, approvals) and known facts extraction, on
 * the `chat` and `helper` roles, against an in-memory world. Grades every case, checks
 * the prompt cache on a two turn chat, and writes a dated results file under
 * `evals/assistant/results/`. Exits 1 when a pass bar is missed.
 *
 * Costs real tokens and needs `ANTHROPIC_API_KEY`. CI never runs it (only mock tests).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readUIMessageStream,
  simulateReadableStream,
  wrapLanguageModel,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { createAiTurn } from "@/assistant/ai-turn";
import { extractKnownFacts } from "@/assistant/extract";
import { resolveModel, type ResolvedModel } from "@/assistant/model-provider";
import { modelConfigs } from "@/assistant/models";
import type { SavedMessage } from "@/assistant/parts";
import { env } from "@/lib/env";
import { getTool, toolIds, tools } from "@/tools/registry";
import { evalCases, type EvalCase } from "./cases";
import { promptFingerprint } from "./fingerprint";
import {
  gradeAmbiguous,
  gradeControl,
  gradeExtraction,
  gradeGrounding,
  gradeOffTopic,
  gradeOnTopic,
  gradePidgin,
  gradeRoute,
  gradeTypedAnswer,
  needsJudge,
  summarize,
  type CaseResult,
  type Grade,
  type JudgeVerdict,
  type ToolCall,
  type TurnObservation,
} from "./graders";
import { judgeReply } from "./judge";
import {
  EVAL_CONVERSATION,
  EVAL_USER,
  evalDeps,
  makeWorld,
  resolveRefs,
  textTurn,
} from "./world";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Usage capture (for the cache check and the token totals)
// ---------------------------------------------------------------------------

type CallUsage = {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
};

/** The role's model, recording each streamed call's usage into `calls`. */
const recording = (
  resolved: ResolvedModel,
  calls: CallUsage[],
): ResolvedModel => {
  const base = resolved.model;
  if (typeof base === "string") return resolved;
  return {
    ...resolved,
    model: wrapLanguageModel({
      model: base,
      middleware: {
        specificationVersion: "v4",
        wrapStream: async ({ doStream }) => {
          const result = await doStream();
          return {
            ...result,
            stream: result.stream.pipeThrough(
              new TransformStream({
                transform(chunk, controller) {
                  if (chunk.type === "finish")
                    calls.push({
                      input: chunk.usage.inputTokens.total ?? 0,
                      cacheRead: chunk.usage.inputTokens.cacheRead ?? 0,
                      cacheWrite: chunk.usage.inputTokens.cacheWrite ?? 0,
                      output: chunk.usage.outputTokens.total ?? 0,
                    });
                  controller.enqueue(chunk);
                },
              }),
            ),
          };
        },
      },
    }),
  };
};

// ---------------------------------------------------------------------------
// Reading a turn
// ---------------------------------------------------------------------------

const readAll = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
};

const observe = (chunks: readonly UIMessageChunk[]): TurnObservation => ({
  toolCalls: chunks.flatMap((c): ToolCall[] =>
    c.type === "tool-input-available"
      ? [{ name: c.toolName, input: c.input }]
      : [],
  ),
  approvalRequested: chunks.some((c) => c.type === "tool-approval-request"),
  text: chunks
    .flatMap((c) => (c.type === "text-delta" ? [c.delta] : []))
    .join("")
    .trim(),
  failed: chunks.some(
    (c) =>
      c.type === "data-error" &&
      ["ai_error", "refusal"].includes(
        String((c as { data?: { kind?: unknown } }).data?.kind),
      ),
  ),
});

/** The assistant message #7 would save from these chunks. */
const asMessage = async (
  id: string,
  chunks: readonly UIMessageChunk[],
): Promise<SavedMessage> => {
  const last = { message: null as UIMessage | null };
  for await (const message of readUIMessageStream({
    stream: simulateReadableStream({
      chunks: [{ type: "start", messageId: id } as UIMessageChunk, ...chunks],
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  }))
    last.message = message;
  return { id, role: "assistant", parts: last.message?.parts ?? [] };
};

// ---------------------------------------------------------------------------
// Running a case
// ---------------------------------------------------------------------------

type Models = { readonly chat: ResolvedModel; readonly helper: ResolvedModel };

type Ran = CaseResult & {
  readonly toolCalls?: readonly ToolCall[];
  readonly facts?: readonly { questionId: string; value: unknown }[];
  readonly usage: readonly CallUsage[];
};

const registered = new Set<string>(toolIds);

const gradeTurn = (
  c: Exclude<EvalCase, { kind: "extraction" }>,
  obs: TurnObservation,
  judge: JudgeVerdict | null,
): Grade => {
  switch (c.kind) {
    case "route":
      return gradeRoute(obs, c.tool);
    case "ambiguous":
      return gradeAmbiguous(
        obs,
        c.allowedTools.filter((t) => registered.has(t)),
      );
    case "off_topic":
      return gradeOffTopic(obs, judge);
    case "on_topic":
      return gradeOnTopic(obs, judge);
    case "pidgin":
      return gradePidgin(obs, judge);
    case "typed_answer":
      return gradeTypedAnswer(obs, c.save);
    case "control":
      return gradeControl(obs, c.tool, resolveRefs(c.input ?? {}));
    case "grounding":
      return gradeGrounding(obs);
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
};

const runCase = async (c: EvalCase, models: Models): Promise<Ran> => {
  const usage: CallUsage[] = [];
  const missing = (c.requiresTools ?? []).filter((t) => !registered.has(t));
  if (missing.length > 0)
    return {
      id: c.id,
      kind: c.kind,
      skipped: true,
      pass: false,
      reasons: [`needs ${missing.join(", ")} (not registered yet)`],
      usage,
    };

  if (c.kind === "extraction") {
    const tool = getTool(c.tool);
    if (!tool.ok)
      return {
        id: c.id,
        kind: c.kind,
        skipped: true,
        pass: false,
        reasons: [`unknown tool ${c.tool}`],
        usage,
      };
    const facts = await extractKnownFacts(
      {
        model: () => models.helper,
        recordUsage: async () => undefined,
        log: () => undefined,
        now: () => Date.now(),
      },
      {
        tool: tool.value,
        history: c.texts.map((text, i) => ({
          id: `${c.id}-${i}`,
          role: "user",
          parts: [{ type: "text", text }],
        })),
        answers: {},
        ownerId: EVAL_USER,
        conversationId: EVAL_CONVERSATION,
        runId: "0190e000-0000-7000-8000-0000000000x1",
      },
    );
    return {
      id: c.id,
      kind: c.kind,
      skipped: false,
      ...gradeExtraction(facts, c.expect),
      facts: facts.map((f) => ({ ...f })),
      usage,
    };
  }

  const world = makeWorld(c.setup);
  const chat = recording(models.chat, usage);
  const turn = createAiTurn(evalDeps(world, { chat, helper: models.helper }));
  const chunks = await readAll(
    await turn(textTurn(world, `${c.id}-u1`, c.message)),
  );
  const obs = observe(chunks);
  const judge =
    needsJudge(c.kind) && !obs.failed
      ? await judgeReply(models.helper, c.message, obs.text)
      : null;
  return {
    id: c.id,
    kind: c.kind,
    skipped: false,
    ...gradeTurn(c, obs, judge),
    text: obs.text,
    toolCalls: obs.toolCalls,
    ...(needsJudge(c.kind) ? { judge } : {}),
    usage,
  };
};

// ---------------------------------------------------------------------------
// The prompt cache check (AC-13, spec 0006 follow up for task 7)
// ---------------------------------------------------------------------------

const cacheCheck = async (models: Models) => {
  const usage: CallUsage[] = [];
  const world = makeWorld(undefined);
  const turn = createAiTurn(
    evalDeps(world, {
      chat: recording(models.chat, usage),
      helper: models.helper,
    }),
  );
  // Three turns: a short first turn may add too few tokens for breakpoint 2 to write,
  // so the history read is proven by whichever later turn reads what the one before wrote.
  const messages = [
    "Hello",
    "What does BeamX do for a shop owner?",
    "Thanks. Do you also help with marketing?",
  ];
  const turns: CallUsage[] = [];
  for (const [i, text] of messages.entries()) {
    const before = usage.length;
    const chunks = await readAll(
      await turn(textTurn(world, `cache-u${i}`, text)),
    );
    world.history.push(await asMessage(`cache-a${i}`, chunks));
    const first = usage[before];
    if (first === undefined)
      return { ran: false as const, note: "a turn made no model call" };
    turns.push(first);
  }
  const pairs = turns.slice(1).map((now, i) => ({ prev: turns[i], now }));
  return {
    ran: true as const,
    turns,
    // Breakpoint 1: the tools and instructions are read from the cache.
    prefixRead: turns.slice(1).every((t) => t.cacheRead > 0),
    // Breakpoint 2: a turn reads the whole span the turn before it cached.
    historyRead: pairs.some(
      ({ prev, now }) =>
        prev !== undefined &&
        prev.cacheWrite > 0 &&
        now.cacheRead >= prev.cacheRead + prev.cacheWrite,
    ),
  };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const mapPool = async <T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const out: R[] = [];
  const cursor = { next: 0 };
  const worker = async () => {
    while (cursor.next < items.length) {
      const i = cursor.next++;
      const item = items[i];
      if (item !== undefined) out[i] = await fn(item);
    }
  };
  await Promise.all(Array.from({ length: size }, worker));
  return out;
};

const resultsPath = (date: string): string => {
  const at = (n: number) =>
    join(RESULTS_DIR, n === 1 ? `${date}.json` : `${date}-${n}.json`);
  const free = Array.from({ length: 99 }, (_, i) => i + 1).find(
    (n) => !existsSync(at(n)),
  );
  return at(free ?? 100);
};

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

const main = async () => {
  if (!env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Add it to .env (it costs real tokens).",
    );
    process.exit(2);
  }
  const cases = evalCases.parse(
    JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8")),
  );
  const models: Models = {
    chat: resolveModel("chat"),
    helper: resolveModel("helper"),
  };
  const started = Date.now();
  console.log(`Running ${cases.length} cases on ${modelConfigs.chat.id}...`);

  const results = await mapPool(cases, CONCURRENCY, async (c) => {
    const r = await runCase(c, models).catch((e: unknown): Ran => ({
      id: c.id,
      kind: c.kind,
      skipped: false,
      pass: false,
      reasons: [`harness error: ${e instanceof Error ? e.message : String(e)}`],
      usage: [],
    }));
    console.log(
      `${r.skipped ? "skip" : r.pass ? "pass" : "FAIL"}  ${r.id}${r.pass ? "" : `  (${r.reasons.join("; ")})`}`,
    );
    return r;
  });
  const cache = await cacheCheck(models).catch((e: unknown) => ({
    ran: false as const,
    note: e instanceof Error ? e.message : String(e),
  }));
  const summary = summarize(results);
  const calls = results.flatMap((r) => r.usage);
  const totals = {
    chatCalls: calls.length,
    input: calls.reduce((s, u) => s + u.input, 0),
    cacheRead: calls.reduce((s, u) => s + u.cacheRead, 0),
    cacheWrite: calls.reduce((s, u) => s + u.cacheWrite, 0),
    output: calls.reduce((s, u) => s + u.output, 0),
  };

  const date = new Date().toISOString().slice(0, 10);
  const file = resultsPath(date);
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        date,
        fingerprint: promptFingerprint(tools),
        models: { chat: modelConfigs.chat, helper: modelConfigs.helper },
        registeredTools: toolIds,
        seconds: Math.round((Date.now() - started) / 1000),
        summary,
        cache,
        chatUsage: totals,
        cases: results.map((r) => ({
          id: r.id,
          kind: r.kind,
          skipped: r.skipped,
          pass: r.pass,
          reasons: r.reasons,
          ...(r.text === undefined ? {} : { text: r.text }),
          ...(r.toolCalls === undefined ? {} : { toolCalls: r.toolCalls }),
          ...(r.facts === undefined ? {} : { facts: r.facts }),
          ...(r.judge === undefined ? {} : { judge: r.judge }),
        })),
      },
      null,
      2,
    )}\n`,
  );

  console.log("");
  console.log(
    `Routing          ${pct(summary.routing.rate)} (${summary.routing.passed}/${summary.routing.total}, bar ${summary.routing.bar}) ${summary.routing.ok ? "ok" : "MISSED"}`,
  );
  console.log(
    `Off topic        ${pct(summary.offTopicDeclined.rate)} declined (bar ${summary.offTopicDeclined.bar}) ${summary.offTopicDeclined.ok ? "ok" : "MISSED"}`,
  );
  console.log(
    `On topic         ${summary.onTopicDeclines.declined}/${summary.onTopicDeclines.total} declined (bar 0) ${summary.onTopicDeclines.ok ? "ok" : "MISSED"}`,
  );
  for (const [kind, rate] of Object.entries(summary.byKind))
    console.log(`  ${kind.padEnd(14)} ${rate.passed}/${rate.total}`);
  console.log(
    `Voice            ${summary.voice.shortReplies}/${summary.voice.replies} replies under 80 words, ${summary.voice.withHeadings} with headings`,
  );
  console.log(
    `Cache            ${cache.ran ? `prefix read ${cache.prefixRead ? "yes" : "NO"}, history read ${cache.historyRead ? "yes" : "NO"}` : `not checked (${cache.note})`}`,
  );
  console.log(`Skipped          ${summary.skipped}`);
  console.log(`Results          ${file}`);
  process.exit(summary.ok ? 0 : 1);
};

void main();
