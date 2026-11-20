/**
 * The only place model ids live (spec 0001; roles from spec 0006, AC-13). Tools name a
 * role, never a model; the report runner resolves it through `model-provider.ts`. #6
 * adds the `chat` and `helper` roles. Pure: no env, no provider.
 */
import type { ModelRole } from "@/tools/registry";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ModelConfig = { readonly id: string; readonly effort: Effort };

export const modelConfigs = {
  report: { id: "claude-opus-5-5", effort: "medium" },
} as const satisfies Readonly<Record<ModelRole, ModelConfig>>;

/** Every model id in use, so `ai-cost.ts` can be checked for a price for each. */
export const modelIds: readonly string[] = [
  ...new Set(Object.values(modelConfigs).map((c) => c.id)),
];
