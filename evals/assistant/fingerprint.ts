/**
 * A fingerprint of everything that shapes the assistant's real model behaviour: the
 * instructions, the extraction prompt, the registry built `startRun` description and the
 * model roles. Every results file records it, and `results.test.ts` fails in CI when the
 * current fingerprint has no results file (AC-15: a prompt or model change needs a new
 * results file committed with it). Pure.
 */
import { createHash } from "node:crypto";
import { EXTRACT_INSTRUCTIONS } from "@/assistant/extract";
import { INSTRUCTIONS } from "@/assistant/instructions";
import { modelConfigs } from "@/assistant/models";
import { startRunDescription } from "@/assistant/tools/start-run";
import type { ToolModule } from "@/tools/registry";

export const promptFingerprint = (tools: readonly ToolModule[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        instructions: INSTRUCTIONS,
        extraction: EXTRACT_INSTRUCTIONS,
        startRun: startRunDescription(tools),
        models: modelConfigs,
      }),
    )
    .digest("hex")
    .slice(0, 16);
