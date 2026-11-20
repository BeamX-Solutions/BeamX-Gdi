/**
 * The per turn run state note (spec 0006, "Run state note"). Pure: built fresh each AI
 * turn from the turn's reads, sent after the history (after cache breakpoint 2), and
 * never saved. It tells the model the active run, the open question, paused runs and
 * the latest completed runs, so it can save typed answers and stay grounded (AC-8,
 * AC-12).
 */
import {
  visibleQuestions,
  type Answers,
  type ToolModule,
  type ToolQuestion,
  type UnknownTool,
} from "@/tools/registry";
import type { Result } from "@/lib/result";
import { openQuestion } from "./card-flow";

/** How many completed runs the note lists, newest first. */
export const COMPLETED_IN_NOTE = 5;

export type RunStateInput = {
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  readonly active: {
    readonly runId: string;
    readonly toolId: string;
    readonly answers: Answers;
    /** The question id of the latest card shown for this run (the open card rule). */
    readonly latestShownId: string | null;
  } | null;
  readonly paused: readonly {
    readonly runId: string;
    readonly toolId: string;
  }[];
  /** The chat's runs, newest first, with their report status when one exists. */
  readonly runs: readonly {
    readonly runId: string;
    readonly toolId: string;
    readonly status: string;
    readonly reportStatus: string | null;
  }[];
  readonly freeMessagesLeft?: number;
};

const toolName = (input: RunStateInput, toolId: string) => {
  const tool = input.getTool(toolId);
  return tool.ok ? tool.value.name : toolId;
};

const quote = (text: string) => JSON.stringify(text);

/** How a question can be answered, in one line, for `saveAnswer` values. */
const answerShape = (q: ToolQuestion): string => {
  switch (q.kind) {
    case "single":
      return `one of: ${q.options.map((o) => `${quote(o.value)} (${o.label})`).join(", ")}`;
    case "multi":
      return `a list of ${q.min} to ${q.max} of: ${q.options.map((o) => `${quote(o.value)} (${o.label})`).join(", ")}`;
    case "scale":
      return `a whole number from ${q.min} (${q.minLabel}) to ${q.max} (${q.maxLabel})`;
    case "text":
      return q.input === "text"
        ? `the client's own words${q.maxLength === undefined ? "" : `, at most ${q.maxLength} characters`}`
        : `${q.input === "money" ? "an amount in naira, as a plain number" : "a number"}${q.minValue === undefined ? "" : ` from ${q.minValue}`}${q.maxValue === undefined ? "" : ` up to ${q.maxValue}`}`;
    default: {
      const unreachable: never = q;
      return unreachable;
    }
  }
};

const activeLines = (
  input: RunStateInput,
  active: NonNullable<RunStateInput["active"]>,
): readonly string[] => {
  const tool = input.getTool(active.toolId);
  if (!tool.ok) return [`Active run: ${active.toolId} (run ${active.runId}).`];
  const visible = visibleQuestions(tool.value, active.answers);
  const answered = visible.filter((q) => active.answers[q.id] !== undefined);
  const open = openQuestion(tool.value, active.answers, active.latestShownId);
  const others = visible.filter((q) => q.id !== open?.id);
  return [
    `Active run: ${tool.value.name} (run ${active.runId}), ${answered.length} of ${visible.length} questions answered.`,
    open === null
      ? "Open question: none, every question is answered."
      : `Open question (id ${open.id}): ${quote(open.prompt)}. Answer with ${answerShape(open)}.`,
    ...(others.length === 0
      ? []
      : [
          "Other questions in this run (id: prompt):",
          ...others.map(
            (q) =>
              `- ${q.id}: ${quote(q.prompt)}${active.answers[q.id] === undefined ? "" : " (answered)"}`,
          ),
        ]),
  ];
};

/** The note text, wrapped in a `<run_state>` block so it reads as data. */
export const buildRunState = (input: RunStateInput): string => {
  const completed = input.runs
    .filter((r) => r.status === "completed")
    .slice(0, COMPLETED_IN_NOTE);
  const lines = [
    ...(input.active === null
      ? ["Active run: none."]
      : activeLines(input, input.active)),
    ...(input.paused.length === 0
      ? []
      : [
          "Paused runs:",
          ...input.paused.map(
            (p) => `- ${toolName(input, p.toolId)} (run ${p.runId})`,
          ),
        ]),
    ...(completed.length === 0
      ? []
      : [
          "Completed runs, newest first:",
          ...completed.map(
            (r) =>
              `- ${toolName(input, r.toolId)} (run ${r.runId}), report ${r.reportStatus ?? "not started"}`,
          ),
        ]),
    ...(input.freeMessagesLeft === undefined
      ? []
      : [`Free messages left today: ${input.freeMessagesLeft}.`]),
  ];
  return `<run_state>\n${lines.join("\n")}\n</run_state>`;
};
