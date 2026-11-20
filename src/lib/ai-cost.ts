/**
 * The AI price table (spec 0001, 0002): turns AI SDK `usage` token counts into dollars
 * for `ai_usage.cost_usd`. Pure. Every model id in `src/assistant/models.ts` must have a
 * price here (a unit test fails otherwise).
 */
import { err, ok, type Result } from "./result";

/** US dollars per million tokens. */
export type ModelPrice = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  /** 5 minute cache write. */
  readonly cacheWrite: number;
};

/** Anthropic first party API prices, checked 2026-11-20. */
export const modelPrices: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** Token counts as `ai_usage` stores them. `inputTokens` is the total, cache included. */
export type TokenUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
};

export type CostError = {
  readonly code: "unknown_model";
  readonly model: string;
};

const count = (n: number | undefined): number =>
  n !== undefined && Number.isFinite(n) && n > 0 ? n : 0;

/**
 * The cost of one call as a decimal string with 6 places (`numeric(12,6)`). Cache reads
 * and writes are priced on their own; the rest of the input at the input price.
 */
export const costUsd = (
  model: string,
  usage: TokenUsage,
): Result<string, CostError> => {
  const price = Object.hasOwn(modelPrices, model)
    ? modelPrices[model]
    : undefined;
  if (!price) return err({ code: "unknown_model", model });
  const cacheRead = count(usage.cacheReadTokens);
  const cacheWrite = count(usage.cacheWriteTokens);
  const plainInput = Math.max(
    0,
    count(usage.inputTokens) - cacheRead - cacheWrite,
  );
  const dollars =
    (plainInput * price.input +
      count(usage.outputTokens) * price.output +
      cacheRead * price.cacheRead +
      cacheWrite * price.cacheWrite) /
    1_000_000;
  return ok(dollars.toFixed(6));
};
