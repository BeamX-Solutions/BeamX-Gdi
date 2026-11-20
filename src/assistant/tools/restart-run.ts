/**
 * `restartRun` (spec 0006, AC-5b, AC-9): "change my answers" after a run completed. A
 * new run of the same tool starts with the old answers copied, behind an approval card
 * with today's price. If the tool changed version since, a fresh run starts instead and
 * the old answers are offered on the prefill card after the stream.
 */
import { tool } from "ai";
import { z } from "zod";
import { priceStillValid } from "@/billing/pricing";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";
import { holdFailure, quoteRun, serverField, type HoldFailure } from "./money";

export const restartRunInput = z.strictObject({
  previousRunId: z
    .string()
    .max(100)
    .describe("The completed run to start again, from the run state note."),
  shownPrice: serverField("The price on the approval card."),
});

export type RestartRunInput = z.infer<typeof restartRunInput>;

/**
 * Writes `shownPrice` only for a completed run of this chat whose tool is registered.
 * The price is the tool's current one, also after a version change (the fresh run).
 */
export const refineRestartRun =
  (env: ToolEnv) =>
  async (input: RestartRunInput): Promise<RestartRunInput> => {
    const bare = { previousRunId: input.previousRunId };
    const read = await quoteRun(env, input.previousRunId);
    if (!read.ok || read.quote.status !== "completed") return bare;
    const found = env.deps.getTool(read.quote.toolId);
    return found.ok ? { ...bare, shownPrice: found.value.creditPrice } : bare;
  };

export type RestartRunOutput =
  | {
      readonly ok: true;
      readonly runId: string;
      readonly toolName: string;
      /** The tool changed version: a fresh run, with the old answers offered. */
      readonly freshStart: boolean;
    }
  | {
      readonly ok: false;
      readonly error: "previous_not_completed" | "price_changed";
    }
  | HoldFailure;

export const restartRunTool = (env: ToolEnv) =>
  tool({
    description:
      "Start a completed run again so the client can change answers. The new run keeps the old answers. The client sees an approval card with the price first.",
    inputSchema: restartRunInput,
    execute: async ({
      previousRunId,
      shownPrice,
    }): Promise<RestartRunOutput> => {
      const { deps, conversationId } = env;
      const done = (output: RestartRunOutput) => {
        deps.log("assistant_tool", {
          name: "restartRun",
          outcome: output.ok ? "ok" : output.error,
        });
        return output;
      };
      const read = await quoteRun(env, previousRunId);
      if (!read.ok) return done({ ok: false, error: read.error });
      if (read.quote.status !== "completed")
        return done({ ok: false, error: "previous_not_completed" });
      const found = deps.getTool(read.quote.toolId);
      if (!found.ok) return done({ ok: false, error: "not_found" });
      const picked = found.value;
      const price = picked.creditPrice;
      // No card was shown (the refinement's read failed): nothing may be held.
      if (shownPrice === undefined)
        return done({ ok: false, error: "try_again" });
      if (!priceStillValid(shownPrice, price))
        return done({ ok: false, error: "price_changed" });

      await deps.ensureAccount(env.owner.current);
      const copied = await asOwner(deps, conversationId, env.owner, (id) =>
        deps.startFromWithHold(id, previousRunId, picked.version, price),
      );
      env.owner.current = copied.owner.current;
      if (copied.result.ok) {
        const runId = copied.result.value.runId;
        env.record({
          kind: "started",
          runId,
          toolId: picked.id,
          from: { kind: "copy" },
        });
        return done({
          ok: true,
          runId,
          toolName: picked.name,
          freshStart: false,
        });
      }

      const failed = copied.result.error;
      switch (failed.code) {
        case "version_changed":
          break;
        case "previous_not_completed":
          return done({ ok: false, error: "previous_not_completed" });
        case "no_conversation":
          return done({ ok: false, error: "not_found" });
        case "insufficient_credits":
        case "run_in_progress":
        case "not_paused":
        case "already_held":
        case "not_found":
          return done(holdFailure(failed, price));
        default: {
          const unreachable: never = failed;
          return unreachable;
        }
      }

      // The tool changed version: a fresh run of the same tool at the same price.
      const fresh = await asOwner(deps, conversationId, env.owner, (id) =>
        deps.startRunWithHold(
          id,
          conversationId,
          picked.id,
          picked.version,
          price,
        ),
      );
      env.owner.current = fresh.owner.current;
      if (!fresh.result.ok) return done(holdFailure(fresh.result.error, price));
      const runId = fresh.result.value.runId;
      env.record({
        kind: "started",
        runId,
        toolId: picked.id,
        from: { kind: "offer", previousRunId },
      });
      return done({ ok: true, runId, toolName: picked.name, freshStart: true });
    },
  });
