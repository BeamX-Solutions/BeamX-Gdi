/**
 * `resumeRun` (spec 0006, AC-3, AC-9): continue a paused run. A run that still holds
 * its credits resumes free with no card. A run whose hold was released needs a new hold,
 * so `refineResumeRun` writes today's price and the approval card shows it.
 */
import { tool } from "ai";
import { z } from "zod";
import { priceStillValid } from "@/billing/pricing";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";
import {
  currentTool,
  holdFailure,
  quoteRun,
  serverField,
  type HoldFailure,
} from "./money";

export const resumeRunInput = z.strictObject({
  runId: z
    .string()
    .max(100)
    .describe("The paused run to continue, from the run state note."),
  shownPrice: serverField("The price on the approval card, if one is needed."),
});

export type ResumeRunInput = z.infer<typeof resumeRunInput>;

/**
 * Writes `shownPrice` only for a paused run of this chat, on its tool's current version,
 * with no active hold. Anything else (a held run, a failed read) leaves it out, so the
 * call runs with no card and `execute` decides.
 */
export const refineResumeRun =
  (env: ToolEnv) =>
  async (input: ResumeRunInput): Promise<ResumeRunInput> => {
    const read = await quoteRun(env, input.runId);
    if (!read.ok) return { runId: input.runId };
    const { quote } = read;
    const picked = currentTool(env, quote);
    return quote.status === "paused" &&
      quote.heldAmount === null &&
      picked !== null
      ? { runId: input.runId, shownPrice: picked.creditPrice }
      : { runId: input.runId };
  };

export type ResumeRunOutput =
  | { readonly ok: true; readonly runId: string; readonly toolName: string }
  | {
      readonly ok: false;
      readonly error: "version_changed" | "approval_required" | "price_changed";
    }
  | HoldFailure;

export const resumeRunTool = (env: ToolEnv) =>
  tool({
    description:
      "Continue a paused run of this chat (the run state note lists them). If the run's credits were released, the client sees an approval card with the price; otherwise it continues straight away.",
    inputSchema: resumeRunInput,
    execute: async ({ runId, shownPrice }): Promise<ResumeRunOutput> => {
      const { deps, conversationId } = env;
      const done = (output: ResumeRunOutput) => {
        deps.log("assistant_tool", {
          name: "resumeRun",
          outcome: output.ok ? "ok" : output.error,
        });
        return output;
      };
      const read = await quoteRun(env, runId);
      if (!read.ok) return done({ ok: false, error: read.error });
      const { quote } = read;
      const picked = currentTool(env, quote);
      if (quote.status !== "paused" && quote.status !== "in_progress")
        return done({ ok: false, error: "not_paused" });
      if (picked === null) return done({ ok: false, error: "version_changed" });
      const resumed = { ok: true, runId, toolName: picked.name } as const;
      if (quote.status === "in_progress") return done(resumed);

      if (quote.heldAmount !== null) {
        const { owner, result } = await asOwner(
          deps,
          conversationId,
          env.owner,
          (id) => deps.resumeRun(id, runId),
        );
        env.owner.current = owner.current;
        if (!result.ok) return done(holdFailure(result.error, 0));
        env.record({ kind: "resumed", runId });
        return done(resumed);
      }

      // No hold: only an approved card with today's price may hold credits.
      if (shownPrice === undefined)
        return done({ ok: false, error: "approval_required" });
      const price = picked.creditPrice;
      if (!priceStillValid(shownPrice, price))
        return done({ ok: false, error: "price_changed" });
      const { owner, result } = await asOwner(
        deps,
        conversationId,
        env.owner,
        (id) => deps.resumeRunWithHold(id, runId, price),
      );
      env.owner.current = owner.current;
      if (!result.ok) return done(holdFailure(result.error, price));
      env.record({ kind: "resumed", runId });
      return done(resumed);
    },
  });
