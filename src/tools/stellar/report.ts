/**
 * Stellar's report (spec 0005): one AI phase, "analysis", ported from the original
 * `app/api/analyze/route.ts`. The output shape is the original's
 * (fixtures/parity/stellar/ai-output-schema.json). Like the original, the schema has no
 * count or length limits (structured outputs reject them), so the prompt guides counts.
 */
import { z } from "zod";
import type { Answers, TypedPhase } from "../_contract";
import { DATA_BLOCK_RULE, fenceData, formatAnswer } from "../_kit/prompt";
import { stellarQuestions } from "./questions";
import type { StellarScores } from "./scoring";

export const analysisSchema = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  personalizedPlan: z.string(),
  weeklyRoadmap: z.array(
    z.object({ week: z.number().int(), tasks: z.array(z.string()) }),
  ),
  resources: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      link: z.string().nullable(),
    }),
  ),
  riskAssessment: z.string(),
});

export type StellarAnalysis = z.infer<typeof analysisSchema>;

export const stellarContentSchema = z.object({ analysis: analysisSchema });

export type StellarContent = z.infer<typeof stellarContentSchema>;

/** Each follow up attaches to its parent question's line, like the original. */
const followUpOf: Readonly<Record<string, string>> = {
  investment: "investment_detail",
  skills: "skills_detail",
  speed: "speed_detail",
  commitment: "commitment_detail",
};

const followUpIds = new Set(Object.values(followUpOf));

/** One line per main question: `Q1. <prompt>: <answer> (Follow-up: ...)`. */
export const answerLines = (answers: Answers): string =>
  stellarQuestions
    .filter((q) => !followUpIds.has(q.id))
    .flatMap((q, index) => {
      const value = answers[q.id];
      if (value === undefined) return [];
      const detailId = followUpOf[q.id];
      const detail = detailId ? answers[detailId] : undefined;
      const followUp =
        typeof detail === "string" && detail.length > 0
          ? ` (Follow-up: ${detail})`
          : "";
      return [
        `Q${index + 1}. ${q.prompt}: ${formatAnswer(q, value)}${followUp}`,
      ];
    })
    .join("\n");

const INSTRUCTIONS = [
  "You are a business validation expert analyzing a startup idea assessment for BeamX Solutions.",
  DATA_BLOCK_RULE,
  "Fill each field as follows:",
  "- strengths: 3 to 5 key strengths based on their responses.",
  "- gaps: 3 to 5 critical gaps they need to address.",
  "- personalizedPlan: a 2 to 3 paragraph strategic plan tailored to their situation. Separate paragraphs with a blank line.",
  "- weeklyRoadmap: 3 to 4 weeks, each with 2 to 4 specific, actionable tasks.",
  "- resources: 2 to 4 resources, each with why it will help them. Set link to a full https URL only if you know a real one, otherwise null.",
  "- riskAssessment: a frank assessment of the biggest risks and how to mitigate them.",
  "Be specific, actionable, and honest. If they are not ready, say so clearly. If they are ready, give them confidence and clear next steps. If the answers suggest the client is in Nigeria, use Nigerian context.",
  "Do not use em dashes anywhere in your response. Use commas, periods, or hyphens instead.",
].join("\n");

export const analysisPhase: TypedPhase<StellarScores> = {
  key: "analysis",
  label: "Analysing your idea",
  modelRole: "report",
  maxOutputTokens: 16_000,
  timeoutMs: 130_000,
  output: analysisSchema,
  buildPrompt: ({ answers, scores }) => ({
    instructions: INSTRUCTIONS,
    prompt: [
      `The entrepreneur scored ${scores.totalPositive}/10 (${scores.level} light status).`,
      "",
      "ASSESSMENT RESPONSES:",
      fenceData(answerLines(answers)),
      "",
      "Provide a comprehensive analysis.",
    ].join("\n"),
  }),
};
