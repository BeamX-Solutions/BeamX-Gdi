/**
 * Test only (spec 0005). A tool with three report phases, each seeing the outputs of
 * the phases before it. Used by the runner tests. Never in the production registry.
 */
import { z } from "zod";
import { err, ok } from "@/lib/result";
import { defineTool, type ToolQuestion } from "../_contract";

const questions: readonly ToolQuestion[] = [
  {
    kind: "single",
    id: "goal",
    prompt: "What do you want?",
    options: [
      { value: "grow", label: "Grow" },
      { value: "start", label: "Start" },
    ],
  },
];

const step = z.object({ text: z.string() });

const contentSchema = z.object({ one: step, two: step, three: step });

const phase = (key: "one" | "two" | "three", label: string) => ({
  key,
  label,
  modelRole: "report" as const,
  maxOutputTokens: 1_000,
  timeoutMs: 30_000,
  output: step,
  buildPrompt: ({
    answers,
    earlier,
  }: {
    readonly answers: Readonly<Record<string, unknown>>;
    readonly earlier: Readonly<Record<string, unknown>>;
  }) => ({
    instructions: `Write step ${key}.`,
    prompt: `Phase ${key}. Goal: ${String(answers.goal)}. Earlier: ${JSON.stringify(earlier)}`,
  }),
});

export const threePhaseTool = defineTool({
  id: "three-phase",
  version: "1",
  name: "Three phase",
  summary: "A test tool.",
  whenToUse: "Never; tests only.",
  creditPrice: 7,
  questions,
  scoresSchema: z.object({}),
  contentSchema,
  score: (answers) =>
    answers.goal === undefined
      ? err({ code: "incomplete", missing: ["goal"] })
      : ok({}),
  phases: [
    phase("one", "Step one"),
    phase("two", "Step two"),
    phase("three", "Step three"),
  ],
  toView: ({ content }) => [
    {
      kind: "bullets",
      title: "Steps",
      items: [content.one.text, content.two.text, content.three.text],
    },
  ],
});
