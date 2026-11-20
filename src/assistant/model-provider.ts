/**
 * Server only. Turns a model role into a live AI SDK model (ids come from `models.ts`).
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { env, fakeAiEnabled } from "@/lib/env";
import { fakeModel } from "@/lib/fake-model";
import { modelConfigs, type AssistantRole, type Effort } from "./models";

/** What a call needs to use a role: the model, its id for records, and its options. */
export type ResolvedModel = {
  readonly id: string;
  readonly model: LanguageModel;
  readonly providerOptions: { readonly anthropic: { readonly effort: Effort } };
};

// A missing key fails the call (the AI SDK throws a load error), which the report
// runner records as a failed attempt; the app itself still boots without it.
const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const resolveModel = (role: AssistantRole): ResolvedModel => {
  const config = modelConfigs[role];
  // E2E only (spec 0007): scripted models, never on a production deploy.
  const fake = fakeAiEnabled()
    ? fakeModel(role === "chat" || role === "helper" ? role : "report")
    : null;
  return {
    id: config.id,
    model: fake ?? anthropic(config.id),
    providerOptions: { anthropic: { effort: config.effort } },
  };
};
