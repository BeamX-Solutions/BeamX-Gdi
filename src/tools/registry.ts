/**
 * The installed tools (spec 0005). Adding a tool is one folder under `src/tools/` plus
 * one entry in this list. The assistant reaches tools only through this file.
 *
 * Pure, so it is safe on the server and the client.
 */
import type { ToolModule } from "./_contract";
import { makeRegistry } from "./_kit/registry";
import { beacon } from "./beacon";
import { stellar } from "./stellar";

export const tools: readonly ToolModule[] = [stellar, beacon];

const registry = makeRegistry(tools);

export const { toolIds, getTool, getReader } = registry;

// The contract types and kit helpers the assistant uses, so it never imports a tool
// folder or the kit directly.
export type {
  Answers,
  AnswerValue,
  ModelRole,
  PhaseClient,
  PhaseContext,
  QuestionProgress,
  QuestionView,
  ReportBlock,
  ReportPhase,
  RichLine,
  RichPart,
  ToolModule,
  ToolQuestion,
  ToolReader,
} from "./_contract";
export { modelRoles } from "./_contract";
export type { UnknownTool, UnsupportedVersion } from "./_kit/registry";
export {
  runFacts,
  scoreRun,
  toAnswers,
  type RunFact,
  type StoredAnswer,
} from "./_kit/readers";
export { parseAnswer, type AnswerError } from "./_kit/answer-schema";
export { nextQuestion, questionProgress, visibleQuestions } from "./_kit/flow";
export { formatAnswer } from "./_kit/format-answer";
export { DATA_BLOCK_RULE, fenceData } from "./_kit/prompt";
