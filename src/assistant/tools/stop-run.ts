/**
 * `stopRun` (spec 0006, AC-9): stop an active or paused run and return its held
 * credits. It always asks first. `refineStopRun` writes `heldAmount` so the card can say
 * how many credits come back; `execute` ignores it and releases whatever hold exists.
 */
import { tool } from "ai";
import { z } from "zod";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";
import { quoteRun, serverField, withSummary, type WithSummary } from "./money";

export const stopRunInput = z.strictObject({
  runId: z
    .string()
    .max(100)
    .describe("The active or paused run to stop, from the run state note."),
  heldAmount: serverField("The credits the card says will be returned."),
});

export type StopRunInput = z.infer<typeof stopRunInput>;

/** Writes `heldAmount` (0 with no hold) only for an active or paused run of this chat. */
export const refineStopRun =
  (env: ToolEnv) =>
  async (input: StopRunInput): Promise<StopRunInput> => {
    const read = await quoteRun(env, input.runId);
    if (!read.ok) return { runId: input.runId };
    const { quote } = read;
    return quote.status === "in_progress" || quote.status === "paused"
      ? { runId: input.runId, heldAmount: quote.heldAmount ?? 0 }
      : { runId: input.runId };
  };

export type StopRunOutput = WithSummary<
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: "already_completed" | "not_found" | "try_again";
    }
>;

export const stopRunTool = (env: ToolEnv) =>
  tool({
    description:
      "Stop an active or paused run of this chat. The client sees a confirm card first, which says how many held credits come back.",
    inputSchema: stopRunInput,
    execute: async ({ runId, heldAmount }): Promise<StopRunOutput> => {
      const { deps, conversationId } = env;
      const done = (output: StopRunOutput) => {
        deps.log("assistant_tool", {
          name: "stopRun",
          outcome: output.ok ? "ok" : output.error,
        });
        return output;
      };

      // No card was shown, so nothing may change: say why.
      if (heldAmount === undefined) {
        const read = await quoteRun(env, runId);
        if (!read.ok) return done({ ok: false, error: read.error });
        switch (read.quote.status) {
          case "completed":
            return done({ ok: false, error: "already_completed" });
          case "abandoned":
            return done({ ok: false, error: "not_found" });
          case "in_progress":
          case "paused":
            return done({ ok: false, error: "try_again" });
          default: {
            const unreachable: never = read.quote.status;
            return unreachable;
          }
        }
      }

      const { owner, result } = await asOwner(
        deps,
        conversationId,
        env.owner,
        (id) => deps.abandonRun(id, runId),
      );
      env.owner.current = owner.current;
      if (!result.ok) return done({ ok: false, error: result.error.code });
      env.record({ kind: "stopped", runId });
      return done(await withSummary(env, { ok: true }));
    },
  });
