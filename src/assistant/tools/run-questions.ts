/**
 * `saveAnswer` and `showQuestion` (spec 0006, AC-8, AC-9): typed answers and reopening a
 * card. Both check the run and the question on the server against a fresh read of the
 * active run; the model's ids are never trusted.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  visibleQuestions,
  type Answers,
  type ToolModule,
} from "@/tools/registry";
import { afterSave, answersFromRows, decideAnswer } from "../card-flow";
import { asOwner } from "../card-steps";
import type { ToolEnv } from "./env";

type LiveRun = {
  readonly runId: string;
  readonly tool: ToolModule;
  readonly answers: Answers;
};

type RunError = "not_found" | "old_version";

/** The chat's active run, if it is `runId` and its tool is current. */
const liveRun = async (
  env: ToolEnv,
  runId: string,
): Promise<
  | { readonly ok: true; readonly live: LiveRun }
  | { readonly ok: false; readonly error: RunError }
> => {
  const read = await env.deps.getActive(env.owner.current, env.conversationId);
  const active = read.active;
  if (active === null || active.run.id !== runId)
    return { ok: false, error: "not_found" };
  const found = env.deps.getTool(active.run.toolId);
  if (!found.ok || found.value.version !== active.run.toolVersion)
    return { ok: false, error: "old_version" };
  return {
    ok: true,
    live: {
      runId,
      tool: found.value,
      answers: answersFromRows(found.value, active.answers),
    },
  };
};

const isVisible = (live: LiveRun, questionId: string) =>
  visibleQuestions(live.tool, live.answers).some((q) => q.id === questionId);

const answerValue = z.union([
  z.string().max(4_000),
  z.number(),
  z.array(z.string().max(200)).max(50),
]);

export type SaveAnswerOutput =
  | { readonly ok: true; readonly next: string | null }
  | { readonly ok: false; readonly error: RunError | "not_visible" }
  | {
      readonly ok: false;
      readonly error: "invalid_answer";
      readonly reason: string;
    };

export const saveAnswerTool = (env: ToolEnv) =>
  tool({
    description:
      "Save the client's typed answer to a question of the active run (usually the open question). Use the option value for a choice, a list of option values for multiple choice, a whole number for a scale, and the client's words for text.",
    inputSchema: z.strictObject({
      runId: z.string().max(100),
      questionId: z.string().max(100),
      value: answerValue,
    }),
    execute: async ({
      runId,
      questionId,
      value,
    }): Promise<SaveAnswerOutput> => {
      const done = (output: SaveAnswerOutput) => {
        env.deps.log("assistant_tool", {
          name: "saveAnswer",
          outcome: output.ok ? "ok" : output.error,
        });
        return output;
      };
      const run = await liveRun(env, runId);
      if (!run.ok) return done({ ok: false, error: run.error });
      const { live } = run;
      if (!isVisible(live, questionId))
        return done({ ok: false, error: "not_visible" });
      const decision = decideAnswer(live.tool, live.answers, {
        questionId,
        value,
      });
      if (decision.kind === "reject")
        return done({
          ok: false,
          error: "invalid_answer",
          reason: decision.note,
        });

      const { owner, result } = await asOwner(
        env.deps,
        env.conversationId,
        env.owner,
        (id) =>
          env.deps.saveAnswer(id, runId, questionId, decision.value, "chat"),
      );
      env.owner.current = owner.current;
      if (!result.ok) return done({ ok: false, error: "not_found" });

      const next = afterSave(live.tool, {
        ...live.answers,
        [questionId]: decision.value,
      });
      env.record({
        kind: "saved",
        runId,
        questionId,
        complete: next.kind === "complete",
      });
      return done({
        ok: true,
        next: next.kind === "card" ? next.question.id : null,
      });
    },
  });

export type ShowQuestionOutput =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: RunError | "not_visible" };

export const showQuestionTool = (env: ToolEnv) =>
  tool({
    description:
      "Open the card of a question in the active run again, so the client can change that answer. The app shows the card after your reply.",
    inputSchema: z.strictObject({
      runId: z.string().max(100),
      questionId: z.string().max(100),
    }),
    execute: async ({ runId, questionId }): Promise<ShowQuestionOutput> => {
      const run = await liveRun(env, runId);
      const output: ShowQuestionOutput = !run.ok
        ? { ok: false, error: run.error }
        : !isVisible(run.live, questionId)
          ? { ok: false, error: "not_visible" }
          : { ok: true };
      if (output.ok) env.record({ kind: "show", runId, questionId });
      env.deps.log("assistant_tool", {
        name: "showQuestion",
        outcome: output.ok ? "ok" : output.error,
      });
      return output;
    },
  });
