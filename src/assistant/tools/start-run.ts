/**
 * `startRun` (spec 0006, AC-2, AC-3). Its `toolId` enum and description are built from
 * the registry, so a new tool needs no edit here. It always needs the client's
 * approval. `shownPrice` is written by the server (`refineStartRun`) before the
 * approval card is streamed; the model never sets it.
 */
import { tool } from "ai";
import { z } from "zod";
import { billingConfig } from "@/billing/config";
import { priceStillValid } from "@/billing/pricing";
import type { ToolModule } from "@/tools/registry";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";
import { holdFailure, serverField, type HoldFailure } from "./money";

/** The description lists each tool's name and when to use it, in registry order. */
export const startRunDescription = (tools: readonly ToolModule[]): string =>
  [
    "Propose starting a BeamX tool run. The client always sees an approval card with the price before anything starts, so calling this is the proposal. Available tools:",
    ...tools.map((t) => `- ${t.id} (${t.name}): ${t.whenToUse}`),
  ].join("\n");

export const startRunInput = (tools: readonly ToolModule[]) =>
  z.strictObject({
    toolId: z.enum(tools.map((t) => t.id)).describe("The tool to start."),
    shownPrice: serverField("The price on the approval card."),
  });

export type StartRunInput = z.infer<ReturnType<typeof startRunInput>>;

/**
 * Writes today's price into the call before the approval card is streamed, and again
 * when the approval comes back. If the price changed in between, the two differ and the
 * AI SDK refuses the approval, so the model calls `startRun` again for a fresh card.
 * The model's own `shownPrice` is always replaced.
 */
export const refineStartRun =
  (env: Pick<ToolEnv, "deps">) =>
  (input: StartRunInput): StartRunInput => {
    const found = env.deps.getTool(input.toolId);
    return found.ok
      ? { toolId: input.toolId, shownPrice: found.value.creditPrice }
      : { toolId: input.toolId };
  };

export type StartRunOutput =
  | { readonly ok: true; readonly runId: string; readonly toolName: string }
  | { readonly ok: false; readonly error: "unknown_tool" | "price_changed" }
  | HoldFailure;

export const startRunTool = (env: ToolEnv) =>
  tool({
    description: startRunDescription(env.deps.tools),
    inputSchema: startRunInput(env.deps.tools),
    execute: async ({ toolId, shownPrice }): Promise<StartRunOutput> => {
      const { deps, conversationId } = env;
      const done = (output: StartRunOutput) => {
        deps.log("assistant_tool", {
          name: "startRun",
          outcome: output.ok ? "ok" : output.error,
          toolId,
        });
        return output;
      };
      const found = deps.getTool(toolId);
      if (!found.ok) return done({ ok: false, error: "unknown_tool" });
      const picked = found.value;
      const price = picked.creditPrice;
      if (shownPrice === undefined || !priceStillValid(shownPrice, price))
        return done({ ok: false, error: "price_changed" });

      await deps.ensureAccount(env.owner.current);
      const { owner, result } = await asOwner(
        deps,
        conversationId,
        env.owner,
        (id) =>
          deps.startRunWithHold(
            id,
            conversationId,
            toolId,
            picked.version,
            price,
          ),
      );
      env.owner.current = owner.current;
      if (result.ok) {
        env.record({
          kind: "started",
          runId: result.value.runId,
          toolId,
          from: { kind: "new" },
        });
        return done({
          ok: true,
          runId: result.value.runId,
          toolName: picked.name,
        });
      }
      return done(holdFailure(result.error, price));
    },
  });

/** The starter grant `ensureAccount` gives a new account (spec 0004). */
export const STARTER_GRANT = billingConfig.grants.starter;
