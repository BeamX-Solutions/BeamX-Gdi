/**
 * Known facts extraction (spec 0006, AC-5): after a turn in which a run started, one
 * call on the `helper` role reads the client's typed text and proposes answers by
 * question id. Every proposal is checked with `parseAnswer` and visibility before it
 * reaches the prefill card, and nothing is saved without the client's confirmation.
 *
 * It never throws and never blocks the run: short text, a timeout, a model error or
 * bad output all give `[]`, and the first card shows instead. Never metered.
 */
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import type { UsageInput } from "@/db/queries/usage";
import { costUsd } from "@/lib/ai-cost";
import {
  DATA_BLOCK_RULE,
  fenceData,
  parseAnswer,
  visibleQuestions,
  type Answers,
  type AnswerValue,
  type ToolModule,
  type ToolQuestion,
} from "@/tools/registry";
import type { LogFn } from "./card-steps";
import type { ResolvedModel } from "./model-provider";
import { clientTexts, type SavedMessage } from "./parts";

/** Client text shorter than this is not worth a call (AC-5). */
export const EXTRACT_MIN_CHARS = 40;
export const EXTRACT_TIMEOUT_MS = 8_000;
export const EXTRACT_MAX_OUTPUT_TOKENS = 1_024;

export const EXTRACT_INSTRUCTIONS = `You read a chat between a small business owner (the client) and the BeamX assistant, and you find answers to a tool's questions that the client has already given.

Rules:
- Only propose an answer the client clearly stated. Never guess, infer a likely value, or fill gaps. When unsure, leave the question out.
- For a single choice question, use one option value. For multiple choice, a list of option values. For a scale, a whole number in range. For text, a short answer in the client's own words; for a number or money question, a plain number with no units or commas.
- Leave out any question the client did not answer. An empty list is a good answer.
- ${DATA_BLOCK_RULE}`;

export type ExtractDeps = {
  readonly model: () => ResolvedModel;
  readonly recordUsage: (input: UsageInput) => Promise<unknown>;
  readonly log: LogFn;
  readonly now: () => number;
};

export type ExtractInput = {
  readonly tool: ToolModule;
  /** The same 30 message window the AI turn reads. */
  readonly history: readonly SavedMessage[];
  /** Answers the run already holds; proposals for these are dropped. */
  readonly answers: Answers;
  readonly ownerId: string;
  readonly conversationId: string;
  readonly runId: string;
};

export type KnownFact = {
  readonly questionId: string;
  readonly value: AnswerValue;
};

/** A question as the extraction prompt shows it. */
const describeQuestion = (q: ToolQuestion) => {
  const base = { id: q.id, prompt: q.prompt, kind: q.kind };
  switch (q.kind) {
    case "single":
    case "multi":
      return {
        ...base,
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      };
    case "scale":
      return { ...base, min: q.min, max: q.max };
    case "text":
      return { ...base, input: q.input };
    default: {
      const unreachable: never = q;
      return unreachable;
    }
  }
};

export const extractionPrompt = (
  tool: ToolModule,
  text: readonly string[],
): string =>
  [
    `The questions of the ${tool.name} tool, as JSON:`,
    JSON.stringify(tool.questions.map(describeQuestion)),
    "",
    "The client's messages, oldest first:",
    fenceData(text.join("\n\n")),
  ].join("\n");

export const extractionSchema = (tool: ToolModule) =>
  z.object({
    answers: z.array(
      z.object({
        questionId: z.enum(tool.questions.map((q) => q.id)),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
      }),
    ),
  });

/**
 * The proposals that may go on the card: each parses, is not already answered, and is
 * visible over the run's answers plus the other valid proposals. The last proposal for
 * a question wins. Pure.
 */
export const usableFacts = (
  tool: ToolModule,
  answers: Answers,
  proposed: readonly { readonly questionId: string; readonly value: unknown }[],
): readonly KnownFact[] => {
  const parsed = new Map<string, AnswerValue>();
  for (const p of proposed) {
    if (answers[p.questionId] !== undefined) continue;
    const result = parseAnswer(tool, p.questionId, p.value);
    if (result.ok) parsed.set(p.questionId, result.value);
  }
  const merged: Answers = { ...answers, ...Object.fromEntries(parsed) };
  return visibleQuestions(tool, merged).flatMap((q) => {
    const value = parsed.get(q.id);
    return value === undefined ? [] : [{ questionId: q.id, value }];
  });
};

const usageInput = (
  deps: ExtractDeps,
  input: ExtractInput,
  modelId: string,
  usage: LanguageModelUsage,
): UsageInput => {
  const tokens = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
  };
  const cost = costUsd(modelId, tokens);
  if (!cost.ok) deps.log("ai_cost_unknown_model", { model: modelId });
  return {
    callKey: `${input.runId}:extraction`,
    userId: input.ownerId,
    conversationId: input.conversationId,
    runId: input.runId,
    purpose: "extraction",
    model: modelId,
    ...tokens,
    costUsd: cost.ok ? cost.value : "0",
  };
};

/** Proposes answers the chat already gave, already parsed and visible; `[]` on any failure. */
export const extractKnownFacts = async (
  deps: ExtractDeps,
  input: ExtractInput,
): Promise<readonly KnownFact[]> => {
  const started = deps.now();
  const text = clientTexts(input.history);
  if (text.join("").length < EXTRACT_MIN_CHARS) return [];
  const resolved = deps.model();
  try {
    const result = await generateText({
      model: resolved.model,
      instructions: EXTRACT_INSTRUCTIONS,
      prompt: extractionPrompt(input.tool, text),
      output: Output.object({ schema: extractionSchema(input.tool) }),
      maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      providerOptions: resolved.providerOptions,
    });
    await deps
      .recordUsage(usageInput(deps, input, resolved.id, result.usage))
      .catch(() => undefined);
    const facts = usableFacts(input.tool, input.answers, result.output.answers);
    deps.log("assistant_extract", {
      proposed: result.output.answers.length,
      valid: facts.length,
      ms: deps.now() - started,
    });
    return facts;
  } catch (e) {
    // Output that failed its schema still cost tokens: record them.
    if (NoObjectGeneratedError.isInstance(e) && e.usage)
      await deps
        .recordUsage(usageInput(deps, input, resolved.id, e.usage))
        .catch(() => undefined);
    deps.log("assistant_extract", {
      proposed: 0,
      valid: 0,
      failed: true,
      ms: deps.now() - started,
    });
    return [];
  }
};
