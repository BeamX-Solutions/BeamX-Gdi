/**
 * Beacon's report (spec 0011): one AI phase, "advisory", where Claude writes the full
 * advisory in five fixed sections. Instructions ported from the standalone's
 * `_build_pro_system_prompt` and `_build_pro_user_prompt` (beamx-scorecard-v2 main.py).
 * `checkAdvisory` holds the section rules, punctuation and length (AC-10).
 */
import { z } from "zod";
import type { Answers, TypedPhase } from "../_contract";
import { DATA_BLOCK_RULE, fenceData, formatAnswer } from "../_kit/prompt";
import { bandLabels, categoryKeys } from "./categories";
import { flagLabel } from "./flags";
import { beaconQuestions } from "./questions";
import type { BeaconScores } from "./scoring";

/** Every text field's limit. */
const TEXT_MAX = 2000;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const text = z.string().min(1).max(TEXT_MAX);
const lineSchema = z.object({ lead: text.optional(), text });

/** The parts Claude may write: no links and no rules (AC-9). */
export const partSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paragraph"), lead: text.optional(), text }),
  z.object({ kind: z.literal("subheading"), text }),
  z.object({ kind: z.literal("label"), text }),
  z.object({ kind: z.literal("note"), text }),
  z.object({ kind: z.literal("bullets"), items: z.array(lineSchema).min(1) }),
  z.object({ kind: z.literal("numbered"), items: z.array(lineSchema).min(1) }),
]);

export type Part = z.infer<typeof partSchema>;

const sectionSchema = z.array(partSchema).min(1).max(40);

export const advisorySchema = z.object({
  executive_summary: sectionSchema,
  critical_priorities: sectionSchema.nullable(),
  strategic_recommendations: sectionSchema,
  growth_opportunities: sectionSchema.nullable(),
  next_steps: sectionSchema,
});

export type Advisory = z.infer<typeof advisorySchema>;

export const beaconContentSchema = z.object({ advisory: advisorySchema });

export type BeaconContent = z.infer<typeof beaconContentSchema>;

/** The section keys in report order, with the standalone's headings (AC-12). */
export const advisorySections = [
  { key: "executive_summary", heading: "Executive Summary" },
  { key: "critical_priorities", heading: "Critical Priorities (Next 30 Days)" },
  { key: "strategic_recommendations", heading: "Strategic Recommendations" },
  { key: "growth_opportunities", heading: "Growth Opportunities" },
  { key: "next_steps", heading: "Your Next Steps" },
] as const satisfies readonly {
  readonly key: keyof Advisory;
  readonly heading: string;
}[];

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export const MIN_WORDS = 700;
export const MAX_WORDS = 1600;

const DASHES = /[–—]/;
const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;

/** Every text of a part, in order. */
export const partTexts = (part: Part): readonly string[] => {
  switch (part.kind) {
    case "paragraph":
      return [part.lead ?? "", part.text];
    case "subheading":
    case "label":
    case "note":
      return [part.text];
    case "bullets":
    case "numbered":
      return part.items.flatMap((item) => [item.lead ?? "", item.text]);
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

const wordCount = (texts: readonly string[]): number =>
  texts.reduce((n, t) => n + (t.match(/\S+/g)?.length ?? 0), 0);

/**
 * Problems with an advisory that passed its schema (AC-10). Pure; an empty list
 * accepts it. A conditional section must exist exactly when its flags do.
 */
export const checkAdvisory = (
  advisory: Advisory,
  scores: Pick<BeaconScores, "flags">,
): readonly string[] => {
  const hasCritical = scores.flags.critical.length > 0;
  const hasOpportunities = scores.flags.opportunities.length > 0;
  const texts = advisorySections.flatMap(
    ({ key }) => advisory[key]?.flatMap(partTexts) ?? [],
  );
  const words = wordCount(texts);
  return [
    ...(hasCritical && advisory.critical_priorities === null
      ? [
          "critical_priorities is missing; there are critical flags, so write it",
        ]
      : []),
    ...(!hasCritical && advisory.critical_priorities !== null
      ? ["critical_priorities must be null; there are no critical flags"]
      : []),
    ...(hasOpportunities && advisory.growth_opportunities === null
      ? [
          "growth_opportunities is missing; there are opportunity flags, so write it",
        ]
      : []),
    ...(!hasOpportunities && advisory.growth_opportunities !== null
      ? ["growth_opportunities must be null; there are no opportunity flags"]
      : []),
    ...(texts.some((t) => DASHES.test(t))
      ? [
          "Remove every em dash and en dash; use a comma, a colon, or a new sentence",
        ]
      : []),
    ...(texts.some((t) => URL_PATTERN.test(t))
      ? ["Remove every web address; add no links"]
      : []),
    ...(words < MIN_WORDS
      ? [`The advisory has ${words} words; write at least ${MIN_WORDS}`]
      : []),
    ...(words > MAX_WORDS
      ? [`The advisory has ${words} words; keep it under ${MAX_WORDS}`]
      : []),
  ];
};

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

const labelOf = (answers: Answers, id: string): string => {
  const question = beaconQuestions.find((q) => q.id === id);
  const value = answers[id];
  return question && value !== undefined ? formatAnswer(question, value) : "";
};

const INSTRUCTIONS = [
  "You are a senior business advisor at BeamX Solutions: sharp, direct, and deeply experienced with small businesses in emerging markets, particularly Nigeria and West Africa.",
  "You write a premium, personal advisory report for a business owner who just completed a diagnostic assessment. This is not a template fill in. Write from scratch, as a real advisor would after studying their data.",
  DATA_BLOCK_RULE,
  "",
  "Writing rules (non negotiable):",
  "- Never use em dashes or en dashes. Use a comma, a period, a colon, or rewrite the sentence.",
  "- Do not use ellipses for effect. Write clear, direct sentences.",
  "- Add no links or web addresses.",
  "",
  "Your voice:",
  "- When a first name is given, use it naturally two or three times per section. When the first name is none, just use you.",
  "- Be honest, warm, and specific. No generic advice that could apply to anyone.",
  "- Refer to their actual answers, scores, and flags throughout. Quote their answers back to them.",
  "- Use Nigerian business context where relevant (naira, CAC registration, power supply, and so on).",
  "",
  "Report structure (return it as JSON with these keys, each a list of parts):",
  "- executive_summary",
  "- critical_priorities: only when there are critical flags; otherwise null",
  "- strategic_recommendations",
  "- growth_opportunities: only when there are opportunity flags; otherwise null",
  "- next_steps",
  "Parts are paragraph (optional bold lead), subheading, label, note, bullets, and numbered (each item has optional bold lead and text). Do not repeat the section heading inside a section.",
  "",
  "Scoring rules: use the total score, category scores, grades and flags exactly as given; never change them.",
  "",
  "Quality standards:",
  "- Every recommendation is specific and actionable (not 'improve your finances' but 'call every customer with invoices over 15 days outstanding this week').",
  "- For each critical flag, give a 30 day plan with Week 1, Week 2 to 3, and Month 1 milestones.",
  "- For the weakest one or two categories, give a concrete 90 day improvement plan.",
  "- For the primary pain point, give a sequenced, prioritized plan.",
  "- Include industry specific metrics and benchmarks where relevant.",
  "- Close next_steps with one clear 30 day focus goal and an invitation to book a free strategy call with BeamX.",
  "",
  `Length: this is a premium report. Write 900 to 1200 words of real advisory content (never under ${MIN_WORDS} or over ${MAX_WORDS}).`,
].join("\n");

const categoryLines = (scores: BeaconScores, answers: Answers): string[] =>
  categoryKeys.flatMap((key) => {
    const c = scores.categories[key];
    const answered = beaconQuestions
      .filter((q) => q.area === c.name)
      .map((q) => `${q.prompt} ${labelOf(answers, q.id)}`);
    return [
      `- ${c.name}: ${c.score}/20 (${c.percentage}%), grade ${c.grade}`,
      ...answered.map((a) => `  ${a}`),
    ];
  });

export const advisoryPhase: TypedPhase<BeaconScores, Advisory> = {
  key: "advisory",
  label: "Writing your advisory",
  modelRole: "report",
  maxOutputTokens: 8_000,
  timeoutMs: 120_000,
  output: advisorySchema,
  buildPrompt: ({ answers, scores, client }) => {
    const critical = scores.flags.critical.map(flagLabel);
    const opportunities = scores.flags.opportunities.map(flagLabel);
    return {
      instructions: INSTRUCTIONS,
      prompt: [
        "Write the Beacon advisory report for this business owner.",
        "",
        fenceData(
          [
            `First name: ${client.firstName ?? "none"}`,
            `Business name: ${labelOf(answers, "business_name")}`,
            `Industry: ${labelOf(answers, "industry")}`,
            `Years in business: ${labelOf(answers, "years_in_business")}`,
            `Primary pain point: ${labelOf(answers, "primary_pain_point")}`,
            "",
            `Overall score: ${scores.total.toFixed(1)}/100`,
            `Stage: ${bandLabels[scores.band]}`,
            "",
            "Category scores and answers:",
            ...categoryLines(scores, answers),
            "",
            `Critical flags: ${critical.length > 0 ? critical.join("; ") : "none"}`,
            `Opportunity flags: ${opportunities.length > 0 ? opportunities.join("; ") : "none"}`,
          ].join("\n"),
        ),
        "",
        critical.length > 0
          ? "There are critical flags: write critical_priorities and address each flag."
          : "There are no critical flags: critical_priorities is null.",
        opportunities.length > 0
          ? "There are opportunity flags: write growth_opportunities and use each flag."
          : "There are no opportunity flags: growth_opportunities is null.",
        "Reminder: no em dashes or en dashes anywhere.",
      ].join("\n"),
    };
  },
  check: (output, { scores }) => checkAdvisory(output, scores),
};
