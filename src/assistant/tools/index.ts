/**
 * The assistant's AI tools for one turn (spec 0006, AC-2, AC-3, AC-9), in a fixed order
 * so the tool definitions stay a byte stable part of the cached prefix (AC-13).
 */
import { refineRestartRun, restartRunTool } from "./restart-run";
import { refineResumeRun, resumeRunTool } from "./resume-run";
import { offerConsultationTool } from "./offer-consultation";
import { saveAnswerTool, showQuestionTool } from "./run-questions";
import { refineStartRun, startRunTool } from "./start-run";
import { refineStopRun, stopRunTool } from "./stop-run";
import { askWhenPresent } from "./money";
import type { ToolEnv } from "./env";

export const TOOL_ORDER = [
  "startRun",
  "resumeRun",
  "restartRun",
  "stopRun",
  "saveAnswer",
  "showQuestion",
  "offerConsultation",
] as const;

export const assistantTools = (env: ToolEnv) => ({
  startRun: startRunTool(env),
  resumeRun: resumeRunTool(env),
  restartRun: restartRunTool(env),
  stopRun: stopRunTool(env),
  saveAnswer: saveAnswerTool(env),
  showQuestion: showQuestionTool(env),
  offerConsultation: offerConsultationTool(env),
});

export type AssistantTools = ReturnType<typeof assistantTools>;

/**
 * Money actions wait for the client's tap whenever the server wrote their field (spec
 * 0006, "Approval rule"). Each rule reads only the refined input, so the AI SDK's second
 * look on the continuation gets the same answer.
 */
export const TOOL_APPROVAL = {
  startRun: (input: { readonly shownPrice?: number }) =>
    askWhenPresent(input.shownPrice),
  resumeRun: (input: { readonly shownPrice?: number }) =>
    askWhenPresent(input.shownPrice),
  restartRun: (input: { readonly shownPrice?: number }) =>
    askWhenPresent(input.shownPrice),
  stopRun: (input: { readonly heldAmount?: number }) =>
    askWhenPresent(input.heldAmount),
} as const;

/**
 * Server written inputs (`shownPrice`, `heldAmount`), built per turn because they read
 * with the turn's owner. Applied before approval and again on the continuation.
 */
export const toolInputRefinement = (env: ToolEnv) => ({
  startRun: refineStartRun(env),
  resumeRun: refineResumeRun(env),
  restartRun: refineRestartRun(env),
  stopRun: refineStopRun(env),
});

export type {
  AssistantToolDeps,
  StartedFrom,
  ToolEnv,
  ToolEvent,
  OwnerBox,
} from "./env";
