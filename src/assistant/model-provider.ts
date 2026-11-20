/**
 * Server only. Turns a model role into a live AI SDK model (ids come from `models.ts`).
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";
import type { ModelRole } from "@/tools/registry";
import { modelConfigs, type Effort } from "./models";

/** What a call needs to use a role: the model, its id for records, and its options. */
export type ResolvedModel = {
  readonly id: string;
  readonly model: LanguageModel;
  readonly providerOptions: { readonly anthropic: { readonly effort: Effort } };
};

// A missing key fails the call (the AI SDK throws a load error), which the report
// runner records as a failed attempt; the app itself still boots without it.
const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const resolveModel = (role: ModelRole): ResolvedModel => {
  const config = modelConfigs[role];
  return {
    id: config.id,
    model: anthropic(config.id),
    providerOptions: { anthropic: { effort: config.effort } },
  };
};
