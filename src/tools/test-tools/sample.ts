/**
 * Test only (spec 0005). A small tool with every card kind, a `when` chain and a
 * `refine`, used by the kit tests. Never in the production registry.
 */
import { z } from "zod";
import { err, ok } from "@/lib/result";
import { defineReader, defineTool, type ToolQuestion } from "../_contract";
import { missingAnswers } from "../_kit/flow";

export const sampleQuestions: readonly ToolQuestion[] = [
  {
    kind: "single",
    id: "stage",
    prompt: "Where are you?",
    options: [
      { value: "idea", label: "Just an idea" },
      { value: "selling", label: "Already selling" },
    ],
  },
  {
    kind: "text",
    id: "monthly_sales",
    prompt: "How much do you sell each month?",
    input: "money",
    minValue: 0,
    maxValue: 1_000_000_000,
    when: (a) => a.stage === "selling",
  },
  {
    kind: "text",
    id: "best_month",
    prompt: "Tell us about your best month.",
    input: "text",
    maxLength: 40,
    // Chained: only after monthly_sales, which is itself only shown when selling.
    when: (a) => typeof a.monthly_sales === "number" && a.monthly_sales > 0,
  },
  {
    kind: "multi",
    id: "channels",
    prompt: "Where do you sell?",
    options: [
      { value: "whatsapp", label: "WhatsApp" },
      { value: "instagram", label: "Instagram" },
      { value: "market", label: "Market stall" },
    ],
    min: 1,
    max: 2,
  },
  {
    kind: "scale",
    id: "confidence",
    prompt: "How sure are you?",
    min: 1,
    max: 5,
    minLabel: "Not sure",
    maxLabel: "Very sure",
  },
  {
    kind: "text",
    id: "team_size",
    prompt: "How many people work with you?",
    input: "number",
    minValue: 0,
    maxValue: 500,
    refine: (v) => (v === 13 ? "We do not take 13." : null),
  },
];

const scoresSchema = z.object({ points: z.number().int() });
const contentSchema = z.object({ advice: z.object({ text: z.string() }) });

export const sampleTool = defineTool({
  id: "sample",
  version: "2",
  name: "Sample",
  summary: "A test tool.",
  whenToUse: "Never; tests only.",
  creditPrice: 5,
  questions: sampleQuestions,
  scoresSchema,
  contentSchema,
  score: (answers) => {
    const missing = missingAnswers({ questions: sampleQuestions }, answers);
    if (missing.length > 0) return err({ code: "incomplete", missing });
    const confidence =
      typeof answers.confidence === "number" ? answers.confidence : 0;
    return ok({
      points: answers.stage === "selling" ? confidence * 2 : confidence,
    });
  },
  phases: [
    {
      key: "advice",
      label: "Writing advice",
      modelRole: "report",
      maxOutputTokens: 500,
      timeoutMs: 30_000,
      output: contentSchema.shape.advice,
      buildPrompt: ({ scores }) => ({
        instructions: "Give advice.",
        prompt: `Points: ${scores.points}`,
      }),
    },
  ],
  toView: ({ scores, content }) => [
    { kind: "text", title: "Advice", paragraphs: [content.advice.text] },
    { kind: "bullets", title: "Points", items: [String(scores.points)] },
  ],
  readers: {
    "1": defineReader({
      questions: sampleQuestions,
      scoresSchema: z.object({ total: z.number() }),
      contentSchema: z.object({ note: z.string() }),
      toView: ({ scores, content }) => [
        {
          kind: "text",
          title: "Old",
          paragraphs: [content.note, String(scores.total)],
        },
      ],
    }),
  },
});
