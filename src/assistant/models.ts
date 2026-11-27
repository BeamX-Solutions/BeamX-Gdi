/**
 * The only place model ids live (spec 0001; roles from spec 0006, AC-13). Tools name a
 * role, never a model; callers resolve it through `model-provider.ts`. `report` is the
 * role report phases may name; `chat` (the AI turn) and `helper` (known facts
 * extraction) are the assistant's own. Pure: no env, no provider.
 */
import type { ModelRole } from "@/tools/registry";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ModelConfig = { readonly id: string; readonly effort: Effort };

/** Every role a call may use: the report phase roles plus the assistant's own. */
export type AssistantRole = ModelRole | "chat" | "helper";

export const modelConfigs = {
  report: { id: "claude-opus-5-5", effort: "medium" },
  // Long phases that must fit one 300 second call (spec 0013): faster than Opus.
  report_long: { id: "claude-sonnet-5-5", effort: "low" },
  chat: { id: "claude-opus-5-5", effort: "low" },
  helper: { id: "claude-opus-5-5", effort: "low" },
} as const satisfies Readonly<Record<AssistantRole, ModelConfig>>;

/** Every model id in use, so `ai-cost.ts` can be checked for a price for each. */
export const modelIds: readonly string[] = [
  ...new Set(Object.values(modelConfigs).map((c) => c.id)),
];
