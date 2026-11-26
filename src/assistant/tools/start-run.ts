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
import { acceptedAnswers, reuseDay, type ReuseNote } from "./reuse";
import {
  cardBalance,
  guardedStart,
  holdFailure,
  serverField,
  withSummary,
  type HoldFailure,
  type RunGuardFailure,
  type WithSummary,
} from "./money";

/** The description lists each tool's name and when to use it, in registry order. */
export const startRunDescription = (tools: readonly ToolModule[]): string =>
  [
    "Propose starting a BeamX tool run. The client always sees an approval card with the price before anything starts, so calling this is the proposal. Available tools:",
    ...tools.map((t) => `- ${t.id} (${t.name}): ${t.whenToUse}`),
  ].join("\n");

const reuseNote = z
  .strictObject({
    runId: z.string().max(100),
    toolName: z.string().max(100),
    answeredOn: z.string().max(40),
  })
  .optional()
  .describe(
    "Earlier answers this run reuses, shown on the approval card. Leave this out; the server fills it in.",
  );

export const startRunInput = (tools: readonly ToolModule[]) =>
  z.strictObject({
    toolId: z.enum(tools.map((t) => t.id)).describe("The tool to start."),
    freshAnswers: z
      .boolean()
      .optional()
      .describe(
        "Set true only when the client asked to answer the questions again instead of reusing earlier answers.",
      ),
    shownPrice: serverField("The price on the approval card."),
    availableBalance: serverField("The balance on the approval card."),
    reuse: reuseNote,
  });

export type StartRunInput = z.infer<ReturnType<typeof startRunInput>>;

/**
 * Writes today's price and the available balance into the call before the approval
 * card is streamed, and again when the approval comes back. If either changed in
 * between, the two differ and the AI SDK refuses the approval, so the model calls
 * `startRun` again for a fresh card. The model's own values are always replaced, and a
 * failed balance read leaves both out (no card, nothing spent).
 */
export const refineStartRun =
  (env: ToolEnv) =>
  async (input: StartRunInput): Promise<StartRunInput> => {
    const bare = {
      toolId: input.toolId,
      ...(input.freshAnswers === true ? { freshAnswers: true } : {}),
    };
    const found = env.deps.getTool(input.toolId);
    if (!found.ok) return bare;
    try {
      const [availableBalance, reuse] = await Promise.all([
        cardBalance(env),
        input.freshAnswers === true
          ? Promise.resolve(null)
          : // A failed reuse read only drops the note: the run asks its questions.
            findReuse(env, found.value).catch(() => null),
      ]);
      return {
        ...bare,
        shownPrice: found.value.creditPrice,
        availableBalance,
        ...(reuse === null ? {} : { reuse }),
      };
    } catch {
      return bare;
    }
  };

/**
 * The reuse note for a tool with `reuseFrom` (spec 0011, AC-3, AC-4): the chat's half
 * done run of one of those tools, else the owner's latest completed one.
 */
const findReuse = async (
  env: ToolEnv,
  picked: ToolModule,
): Promise<ReuseNote | null> => {
  if (!picked.reuseFrom || picked.reuseFrom.length === 0) return null;
  const source = await env.deps.reuseSource(
    env.owner.current,
    env.conversationId,
    picked.reuseFrom,
  );
  if (source === null) return null;
  const from = env.deps.getTool(source.toolId);
  const answeredOn = reuseDay(
    source.lastAnswerAt,
    billingConfig.chat.dayTimeZone,
  );
  if (!from.ok || answeredOn === null) return null;
  return { runId: source.runId, toolName: from.value.name, answeredOn };
};

export type StartRunOutput = WithSummary<
  | {
      readonly ok: true;
      readonly runId: string;
      readonly toolName: string;
      /** The reused answers were gone at Approve, so every question is asked (AC-8). */
      readonly freshStart?: true;
    }
  | { readonly ok: false; readonly error: "unknown_tool" | "price_changed" }
  | HoldFailure
  | RunGuardFailure
>;

export const startRunTool = (env: ToolEnv) =>
  tool({
    description: startRunDescription(env.deps.tools),
    inputSchema: startRunInput(env.deps.tools),
    execute: async ({
      toolId,
      shownPrice,
      freshAnswers,
      reuse,
    }): Promise<StartRunOutput> => {
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

      // A guest's run passes the spend cap and the daily run limits first (spec 0008).
      return done(
        await guardedStart(env, async (): Promise<StartRunOutput> => {
          await deps.ensureAccount(env.owner.current, env.isGuest, env.ip);
          if (reuse !== undefined && freshAnswers !== true) {
            const reused = await startReused(env, picked, reuse.runId, price);
            if (reused !== "source_gone") return withSummary(env, reused);
          }
          const freshStart = reuse !== undefined && freshAnswers !== true;
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
            return withSummary(env, {
              ok: true,
              runId: result.value.runId,
              toolName: picked.name,
              ...(freshStart ? { freshStart: true as const } : {}),
            });
          }
          return withSummary(env, holdFailure(result.error, price));
        }),
      );
    },
  });

/**
 * Starts a run from the reused run's answers with its hold (spec 0011, AC-6). Returns
 * `source_gone` when the source can no longer be read or copied, so the caller starts
 * a fresh run at the same price instead (AC-8).
 */
const startReused = async (
  env: ToolEnv,
  picked: ToolModule,
  sourceRunId: string,
  price: number,
): Promise<
  Extract<StartRunOutput, { readonly ok: true }> | HoldFailure | "source_gone"
> => {
  const { deps, conversationId } = env;
  const old = await deps.oldAnswers(env.owner.current, sourceRunId);
  if (!old.ok) return "source_gone";
  const answers = acceptedAnswers(picked, old.value);
  const { owner, result } = await asOwner(
    deps,
    conversationId,
    env.owner,
    (id) =>
      deps.startFromOtherWithHold(
        id,
        conversationId,
        sourceRunId,
        picked.id,
        picked.version,
        price,
        answers,
      ),
  );
  env.owner.current = owner.current;
  if (!result.ok)
    return result.error.code === "not_found"
      ? "source_gone"
      : holdFailure(result.error, price);
  env.record({
    kind: "started",
    runId: result.value.runId,
    toolId: picked.id,
    from: { kind: "reuse" },
  });
  return { ok: true, runId: result.value.runId, toolName: picked.name };
};

/** The starter grant `ensureAccount` gives a new account (spec 0004). */
export const STARTER_GRANT = billingConfig.grants.starter;
