/**
 * Luna's five report phases (spec 0013, AC-5, AC-14, AC-15), ported from the standalone's
 * `src/lib/claude.ts`: analysis (context only), core, overview, operations, assets. Each
 * phase runs in its own call (`phasesPerCall: 1`) on the `report_long` role. The website
 * is passed as an address only; it is never fetched (AC-14). Pure.
 */
import { z } from "zod";
import type { Answers, ToolQuestion, TypedPhase } from "../_contract";
import { DATA_BLOCK_RULE, fenceData, formatAnswer } from "../_kit/prompt";
import { lunaQuestions } from "./facts";
import {
  analysisSchema,
  assetsSchema,
  coreSchema,
  operationsSchema,
  overviewSchema,
  type Analysis,
  type Assets,
  type Core,
  type Operations,
  type Overview,
} from "./plan";
import { SQUARES } from "./questions";

/** Luna has no scoring: completeness only, kept as the run's scores (AC-5). */
export const lunaScoresSchema = z.object({ answered: z.number().int().min(0) });
export type LunaScores = z.infer<typeof lunaScoresSchema>;

/** Per phase AI call: with a repair, two tries fit the 280 second call budget. */
export const LUNA_PHASE_TIMEOUT_MS = 135_000;

// ---------------------------------------------------------------------------
// The answers block
// ---------------------------------------------------------------------------

const answerLine = (q: ToolQuestion, answers: Answers): string | null => {
  const value = answers[q.id];
  if (value === undefined) return null;
  return `- ${q.prompt} ${formatAnswer(q, value)}`;
};

/** Business context, then the questionnaire by square, in plain words. */
export const answersBlock = (answers: Answers): string => {
  const context = lunaQuestions
    .filter((q) => q.area === "Your business")
    .flatMap((q) => answerLine(q, answers) ?? []);
  const squares = SQUARES.flatMap((square, i) => {
    const lines = lunaQuestions
      .filter((q) => q.area === square)
      .flatMap((q) => answerLine(q, answers) ?? []);
    return lines.length === 0
      ? []
      : [`Square ${i + 1}: ${square}`, ...lines, ""];
  });
  return [
    "Business context:",
    ...context,
    "",
    "Questionnaire responses:",
    ...squares,
  ].join("\n");
};

const nameOf = (answers: Answers): string => {
  const name = answers["business-name"];
  return typeof name === "string" && name.trim() !== ""
    ? name.trim()
    : "Unknown Business";
};

const websiteOf = (answers: Answers): string => {
  const site = answers["business-website"];
  return typeof site === "string" && site.trim() !== ""
    ? site.trim()
    : "No website provided";
};

const dataBlock = (
  answers: Answers,
  earlier: readonly (readonly [string, unknown])[],
): string =>
  fenceData(
    [
      `Business name: ${nameOf(answers)}`,
      `Business website: ${websiteOf(answers)} (an address only; its content is not available)`,
      "",
      answersBlock(answers),
      ...earlier.flatMap(([label, value]) => [
        "",
        `${label} (JSON):`,
        JSON.stringify(value),
      ]),
    ].join("\n"),
  );

// ---------------------------------------------------------------------------
// Shared rules and checks
// ---------------------------------------------------------------------------

const SHARED_RULES = [
  "GLOBAL RULES (apply to every field):",
  "- Be specific to THIS business. No generic filler, no repetition across fields.",
  "- Where money appears, use the business's local currency symbol inferred from its geographic scope (for example the naira sign for Nigeria, the dollar sign for the US). Use ranges where exact figures are unknown.",
  "- Do NOT use em dashes or en dashes anywhere. Use commas, periods, or hyphens.",
  '- A few string fields support a SINGLE leading "**bold**" marker for a label or prefix only (for example "**Trigger:** if the close rate drops..."). Never put bold in the middle of a sentence.',
  "- Return the JSON object only, with exactly the keys described.",
].join("\n");

const count = (
  what: string,
  items: readonly unknown[],
  min: number,
  max: number = min,
): readonly string[] =>
  items.length < min || items.length > max
    ? [
        min === max
          ? `${what} must have exactly ${min} items, not ${items.length}`
          : `${what} must have ${min} to ${max} items, not ${items.length}`,
      ]
    : [];

const atMostOrange = (
  what: string,
  items: readonly { readonly accent?: "orange" }[],
  max: number,
): readonly string[] =>
  items.filter((i) => i.accent === "orange").length > max
    ? [`${what}: at most ${max} may set accent "orange"`]
    : [];

// ---------------------------------------------------------------------------
// The phases
// ---------------------------------------------------------------------------

const ANALYSIS_INSTRUCTIONS = [
  "You are an expert marketing strategist analyzing a business for comprehensive strategic planning.",
  DATA_BLOCK_RULE,
  "Review the business information and questionnaire responses, then provide a thorough analysis with these fields:",
  "1. businessModelAssessment: evaluation of the business model strengths and weaknesses",
  "2. marketOpportunity: analysis of market size, trends, and opportunities",
  "3. competitivePositioning: assessment of competitive landscape and positioning",
  "4. customerAvatarRefinement: detailed ideal customer profile based on responses",
  "5. strategicRecommendations: specific, actionable strategic recommendations",
  "6. riskFactors: potential challenges and risks to consider",
  "7. growthPotential: assessment of growth opportunities and scalability",
  "Structure the analysis professionally with clear insights and actionable observations.",
  SHARED_RULES,
].join("\n");

export const analysisPhase: TypedPhase<LunaScores, Analysis> = {
  key: "analysis",
  label: "Studying your business",
  modelRole: "report_long",
  maxOutputTokens: 12_000,
  timeoutMs: LUNA_PHASE_TIMEOUT_MS,
  output: analysisSchema,
  buildPrompt: ({ answers }) => ({
    instructions: ANALYSIS_INSTRUCTIONS,
    prompt: ["Analyze this business.", "", dataBlock(answers, [])].join("\n"),
  }),
};

const CORE_INSTRUCTIONS = [
  "You develop the core marketing strategy for a business using the BeamX 9-square framework, mapped to a customer journey.",
  DATA_BLOCK_RULE,
  "Return:",
  '- customerJourney: "intro" (1-2 sentences framing the three-stage journey for this business) and exactly 3 "stages":',
  '  1. tag "BEFORE", sub "Prospects", step "ATTRACT", tone "before", columns: Target Market (ideal customer avatar: demographics, psychographics, buying behavior, 3-4 sentences), Core Message (the unique value proposition and why it beats alternatives, 3-4 sentences), Media Channels (the top 2-3 channels with rationale, as prose, 2-3 sentences).',
  '  2. tag "DURING", sub "Leads", step "CONVERT", tone "during", columns: Lead Capture (lead magnet and primary call to action, 2-3 sentences), Lead Nurture (nurture sequence and cadence, 2-3 sentences), Sales Conversion (sales process and conversion tactics, 2-3 sentences).',
  '  3. tag "AFTER", sub "Customers", step "RETAIN & GROW", tone "after", columns: Deliver Experience (onboarding and delivery, 2-3 sentences), Lifetime Value (retention and upsell pathways with targets, 2-3 sentences), Referrals (systematic referral generation with targets, 2-3 sentences).',
  '- strategicInsights: "strengths" (4-6 concrete strengths to leverage, one sentence each) and "opportunities" (4-6 specific market opportunities, one sentence each).',
  '- risksPositioning: "risks" (4-6, each with "severity" exactly "high", "medhigh" or "med", a short "label" and a 1-2 sentence "body" with the risk and how to mitigate it, ordered from most to least severe), "positioning" (a 2-4 sentence recommended positioning statement, which may start with one **bold** label), and "callout" with title "COMPETITIVE ADVANTAGE & GROWTH POTENTIAL", accent "orange", and a 3-5 sentence body combining the competitive moat with realistic growth projections.',
  SHARED_RULES,
].join("\n");

export const corePhase: TypedPhase<LunaScores, Core> = {
  key: "core",
  label: "Mapping your customer journey",
  modelRole: "report_long",
  maxOutputTokens: 12_000,
  timeoutMs: LUNA_PHASE_TIMEOUT_MS,
  output: coreSchema,
  buildPrompt: ({ answers, earlier }) => ({
    instructions: CORE_INSTRUCTIONS,
    prompt: [
      "Develop the core marketing plan for this business.",
      "",
      dataBlock(answers, [["Business analysis", earlier.analysis]]),
    ].join("\n"),
  }),
  check: (output) => [
    ...count("customerJourney.stages", output.customerJourney.stages, 3),
    ...output.customerJourney.stages.flatMap((s, i) =>
      count(`customerJourney.stages[${i}].columns`, s.columns, 3),
    ),
    ...(output.customerJourney.stages.map((s) => s.tone).join(",") ===
    "before,during,after"
      ? []
      : ['The stage tones must be "before", "during", "after", in that order']),
    ...count(
      "strategicInsights.strengths",
      output.strategicInsights.strengths,
      4,
      6,
    ),
    ...count(
      "strategicInsights.opportunities",
      output.strategicInsights.opportunities,
      4,
      6,
    ),
    ...count("risksPositioning.risks", output.risksPositioning.risks, 4, 6),
  ],
};

const OVERVIEW_INSTRUCTIONS = [
  "You write the executive summary and the phased implementation roadmap of a marketing plan, building on the business analysis and the core marketing plan.",
  DATA_BLOCK_RULE,
  "Return:",
  '- executiveSummary: exactly 3 "stats" (real, business specific figures such as currency ranges, percentages or time, each with a short UPPERCASE "label"; at most one may set accent "orange"), exactly 3 "paragraphs" of roughly 60-90 words (who the business is and the headline opportunity; the highest ROI foundational moves and expected outcome; how the pipeline builds over 180 days within budget and time constraints), and a "callout" titled "HOW SUCCESS IS MEASURED" with 2-3 sentences naming the core KPIs and the review cadence.',
  '- implementation: "intro" (1-2 sentences explaining the three sequenced phases) and exactly 3 "phases": code "PHASE 01", title "Foundation", when "First 30 Days"; code "PHASE 02", title "Pipeline", when "Days 31-90"; code "PHASE 03", title "Scale", when "Days 91-180". Each phase has 5-7 "steps", one action first sentence each.',
  SHARED_RULES,
].join("\n");

export const overviewPhase: TypedPhase<LunaScores, Overview> = {
  key: "overview",
  label: "Writing your summary and roadmap",
  modelRole: "report_long",
  maxOutputTokens: 10_000,
  timeoutMs: LUNA_PHASE_TIMEOUT_MS,
  output: overviewSchema,
  buildPrompt: ({ answers, earlier }) => ({
    instructions: OVERVIEW_INSTRUCTIONS,
    prompt: [
      "Write the executive summary and implementation roadmap.",
      "",
      dataBlock(answers, [
        ["Business analysis", earlier.analysis],
        ["Core marketing plan", earlier.core],
      ]),
    ].join("\n"),
  }),
  check: (output) => [
    ...count("executiveSummary.stats", output.executiveSummary.stats, 3),
    ...atMostOrange("executiveSummary.stats", output.executiveSummary.stats, 1),
    ...count(
      "executiveSummary.paragraphs",
      output.executiveSummary.paragraphs,
      3,
    ),
    ...count("implementation.phases", output.implementation.phases, 3),
    ...output.implementation.phases.flatMap((p, i) =>
      count(`implementation.phases[${i}].steps`, p.steps, 5, 7),
    ),
  ],
};

const OPERATIONS_INSTRUCTIONS = [
  "You detail the resources and budget and the KPI scorecard of a marketing plan, building on the analysis, the core plan and the implementation roadmap.",
  DATA_BLOCK_RULE,
  "Return:",
  '- resources: "intro" (1-2 sentences on the tooling and budget philosophy), exactly 3 "stats" (total spend, reserve, weekly time; short UPPERCASE labels; at most one accent "orange"), 5-8 "items" (each "label" a short lead in ending with a colon, such as "Website:", and "body" the specific tool recommendation and its cost), and a "callout" titled "WEEKLY TIME ALLOCATION" with 2-3 sentences breaking down the weekly or monthly time commitment.',
  '- kpis: "intro" (1-2 sentences on what to track and the review cadence), 6-8 "rows" (each with a "metric", how and where it is "tracked", and a concrete "target" with a timeframe; keep cells concise), and a "note" that begins with a single **bold** label, such as "**Trigger:** ...", describing a condition that should prompt a strategy review.',
  SHARED_RULES,
].join("\n");

export const operationsPhase: TypedPhase<LunaScores, Operations> = {
  key: "operations",
  label: "Planning your budget and KPIs",
  modelRole: "report_long",
  maxOutputTokens: 9_000,
  timeoutMs: LUNA_PHASE_TIMEOUT_MS,
  output: operationsSchema,
  buildPrompt: ({ answers, earlier }) => ({
    instructions: OPERATIONS_INSTRUCTIONS,
    prompt: [
      "Detail the resources, budget and KPIs.",
      "",
      dataBlock(answers, [
        ["Business analysis", earlier.analysis],
        ["Core marketing plan", earlier.core],
        ["Implementation roadmap", earlier.overview],
      ]),
    ].join("\n"),
  }),
  check: (output) => [
    ...count("resources.stats", output.resources.stats, 3),
    ...atMostOrange("resources.stats", output.resources.stats, 1),
    ...count("resources.items", output.resources.items, 5, 8),
    ...count("kpis.rows", output.kpis.rows, 6, 8),
    ...(output.kpis.note.startsWith("**")
      ? []
      : ['kpis.note must begin with a single "**bold**" label']),
  ],
};

const ASSETS_INSTRUCTIONS = [
  "You produce the ready to use templates and the investment and ROI case of a marketing plan, building on the full plan so far.",
  DATA_BLOCK_RULE,
  "Return:",
  '- templates: "intro" (1-2 sentences on why these reusable assets matter) and exactly 4 "cards", indexed "1" to "4", each with a "title", a short UPPERCASE tool or format "meta" tag (such as GOOGLE DOCS or MAILCHIMP), and a 2-4 sentence "body" on what it contains and how to use it.',
  '- investmentRoi: "intro" (1 sentence framing where to invest first), 5-6 "investments" (each "badge" is two short lines separated by a newline, a cost line and a timing line such as a currency range then "Month 1"; a "title"; a 1-2 sentence "body" on why it matters and the expected return; accent "orange" on at most two high priority investments), and a "callout" titled "EXPECTED RETURN", accent "orange", with 3-5 sentences quantifying the expected ROI with real, business specific figures.',
  SHARED_RULES,
].join("\n");

export const assetsPhase: TypedPhase<LunaScores, Assets> = {
  key: "assets",
  label: "Preparing your templates and ROI",
  modelRole: "report_long",
  maxOutputTokens: 9_000,
  timeoutMs: LUNA_PHASE_TIMEOUT_MS,
  output: assetsSchema,
  buildPrompt: ({ answers, earlier }) => ({
    instructions: ASSETS_INSTRUCTIONS,
    prompt: [
      "Produce the templates and the investment and ROI case.",
      "",
      dataBlock(answers, [
        ["Business analysis", earlier.analysis],
        ["Core marketing plan", earlier.core],
        ["Implementation roadmap", earlier.overview],
        ["Resources and KPIs", earlier.operations],
      ]),
    ].join("\n"),
  }),
  check: (output) => [
    ...count("templates.cards", output.templates.cards, 4),
    ...count(
      "investmentRoi.investments",
      output.investmentRoi.investments,
      5,
      6,
    ),
    ...atMostOrange(
      "investmentRoi.investments",
      output.investmentRoi.investments,
      2,
    ),
  ],
};
