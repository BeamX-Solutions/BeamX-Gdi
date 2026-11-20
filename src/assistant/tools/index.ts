/**
 * The assistant's AI tools for one turn (spec 0006, AC-2, AC-3), in a fixed order so the
 * tool definitions stay a byte stable part of the cached prefix (AC-13). `resumeRun`,
 * `stopRun` and `restartRun` join in build plan task 6.
 */
import { refineStartRun, startRunTool } from "./start-run";
import { saveAnswerTool, showQuestionTool } from "./run-questions";
import type { AssistantToolDeps, ToolEnv } from "./env";

export const TOOL_ORDER = ["startRun", "saveAnswer", "showQuestion"] as const;

export const assistantTools = (env: ToolEnv) => ({
  startRun: startRunTool(env),
  saveAnswer: saveAnswerTool(env),
  showQuestion: showQuestionTool(env),
});

export type AssistantTools = ReturnType<typeof assistantTools>;

/** Money actions always wait for the client's tap; the rest run directly. */
export const TOOL_APPROVAL = { startRun: "user-approval" } as const;

/** Server written inputs (`shownPrice`), applied before approval and on continuation. */
export const toolInputRefinement = (
  deps: Pick<AssistantToolDeps, "getTool">,
) => ({
  startRun: refineStartRun((toolId) => {
    const found = deps.getTool(toolId);
    return found.ok ? found.value.creditPrice : 0;
  }),
});

export type { AssistantToolDeps, ToolEnv, ToolEvent, OwnerBox } from "./env";
