/**
 * Test only (spec 0005). One folder serving two products: both modules share the
 * questions and the scoring, and differ in id, price, phases and view. Never in the
 * production registry.
 */
import { z } from "zod";
import { defineTool, type ReportPhase } from "@/tools/_contract";
import { pairQuestions } from "./questions";
import { pairScoresSchema, scorePair, type PairScores } from "./scoring";

const note = z.object({ text: z.string() });

const phase = (key: string, label: string) => ({
  key,
  label,
  modelRole: "report" as const satisfies ReportPhase["modelRole"],
  maxOutputTokens: 1_000,
  timeoutMs: 60_000,
  output: note,
  buildPrompt: ({ scores }: { readonly scores: PairScores }) => ({
    instructions: `Write the ${key}.`,
    prompt: `Score ${scores.total} of ${scores.max}.`,
  }),
});

const shared = {
  version: "1",
  whenToUse: "Never; tests only.",
  questions: pairQuestions,
  scoresSchema: pairScoresSchema,
  score: scorePair,
} as const;

const basicContent = z.object({ summary: note });

export const pairBasic = defineTool({
  ...shared,
  id: "pair-basic",
  name: "Pair basic",
  summary: "A test tool.",
  creditPrice: 10,
  contentSchema: basicContent,
  phases: [phase("summary", "Writing the summary")],
  toView: ({ scores, content }) => [
    {
      kind: "score_header",
      title: "Pair basic",
      score: scores.total,
      max: scores.max,
      verdict: scores.total * 2 > scores.max ? "good" : "risk",
      summary: content.summary.text,
    },
  ],
});

const proContent = z.object({ summary: note, plan: note });

export const pairPro = defineTool({
  ...shared,
  id: "pair-pro",
  name: "Pair pro",
  summary: "A test tool with a longer report.",
  creditPrice: 25,
  contentSchema: proContent,
  phases: [
    phase("summary", "Writing the summary"),
    phase("plan", "Writing the plan"),
  ],
  toView: ({ scores, content }) => [
    {
      kind: "score_header",
      title: "Pair pro",
      score: scores.total,
      max: scores.max,
      verdict: scores.total * 2 > scores.max ? "good" : "risk",
      summary: content.summary.text,
    },
    { kind: "text", title: "Plan", paragraphs: [content.plan.text] },
  ],
});
