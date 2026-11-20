/**
 * Stellar scoring (spec 0005), ported from the original `lib/scoring.ts`.
 *
 * Two differences on purpose (fixtures/parity/README.md): dimensions are looked up by
 * question id, not by answer order, and dimension 8 is "Competitor Awareness".
 */
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import type { Answers, ScoreError } from "../_contract";
import { missingAnswers, visibleAnswers } from "../_kit/flow";
import { stellarQuestions } from "./questions";

export const scoreLevels = ["green", "yellow", "red"] as const;
export type ScoreLevel = (typeof scoreLevels)[number];

export const stellarScoresSchema = z.object({
  level: z.enum(scoreLevels),
  score: z.number().int().min(0).max(100),
  totalPositive: z.number().int().min(0).max(10),
  title: z.string(),
  summary: z.string(),
  actionItems: z.array(z.string()),
  timeframe: z.string(),
  dimensions: z.array(
    z.object({
      name: z.string(),
      score: z.number().int().min(0).max(1),
      maxScore: z.literal(1),
    }),
  ),
});

export type StellarScores = z.infer<typeof stellarScoresSchema>;

const textAt = (answers: Answers, id: string): string => {
  const value = answers[id];
  return typeof value === "string" ? value : "";
};

/** Whether an answer counts as positive, by question id; in the original's order. */
const dimensionRules: readonly {
  readonly name: string;
  readonly questionId: string;
  readonly isPositive: (answer: string) => boolean;
}[] = [
  {
    name: "Foundation",
    questionId: "foundation",
    isPositive: (a) => a === "all-three",
  },
  {
    name: "Value Clarity",
    questionId: "value_creation",
    isPositive: (a) => a.length > 20,
  },
  {
    name: "Market Validation",
    questionId: "market_validation",
    isPositive: (a) => a === "yes-confirmed",
  },
  {
    name: "Investment",
    questionId: "investment",
    isPositive: (a) => a === "under-100" || a === "100-500",
  },
  {
    name: "Skills",
    questionId: "skills",
    isPositive: (a) => a === "yes-regularly" || a === "sometimes",
  },
  {
    name: "Speed",
    questionId: "speed",
    isPositive: (a) => a === "yes-ready" || a === "almost",
  },
  {
    name: "Passion-Market Fit",
    questionId: "passion_market_fit",
    isPositive: (a) => a === "both",
  },
  {
    name: "Competitor Awareness",
    questionId: "competitors",
    isPositive: (a) => a.length > 5,
  },
  {
    name: "Learning",
    questionId: "learning",
    isPositive: (a) => a === "start-imperfect" || a === "hire-complement",
  },
  {
    name: "Commitment",
    questionId: "commitment",
    isPositive: (a) => a === "yes",
  },
];

export const calculateDimensionScores = (
  answers: Answers,
): StellarScores["dimensions"] =>
  dimensionRules.map((rule) => ({
    name: rule.name,
    score: rule.isPositive(textAt(answers, rule.questionId)) ? 1 : 0,
    maxScore: 1 as const,
  }));

const levelFor = (positive: number): ScoreLevel =>
  positive >= 8 ? "green" : positive >= 5 ? "yellow" : "red";

const titles: Readonly<Record<ScoreLevel, string>> = {
  green: "GREEN LIGHT - Strong Foundations",
  yellow: "YELLOW LIGHT - Almost Ready",
  red: "RED LIGHT - Foundation Work Needed",
};

const onlyIf = (condition: boolean, items: readonly string[]) =>
  condition ? items : [];

const answerItems = (answers: Answers): readonly string[] => {
  const q1 = textAt(answers, "foundation");
  const q3 = textAt(answers, "market_validation");
  const q4 = textAt(answers, "investment");
  const q5 = textAt(answers, "skills");
  const q6 = textAt(answers, "speed");
  const q7 = textAt(answers, "passion_market_fit");
  const q10 = textAt(answers, "commitment");
  const blocker = textAt(answers, "speed_detail");

  const speedItems = (): readonly string[] => {
    switch (q6) {
      case "months":
        return [
          "Week 1: Define your MVP - the smallest version you could launch to test demand right now",
          "Week 2: Set a specific target launch date and work backwards to plan what must happen first",
          'Week 2: Separate "must have for launch" from "nice to have later" - cut everything that is not critical',
        ];
      case "almost":
        return [
          blocker
            ? `Week 1: Resolve your specific blockers: "${blocker.slice(0, 80)}"`
            : "Week 1: List every remaining item stopping you from launching - resolve them one by one",
          "Week 2: Set a hard launch date no more than 2 weeks from today",
        ];
      case "yes-ready":
        return [
          "This week: Reach out to your warmest leads and make your first sale",
          "This week: Set up your payment system if you have not already",
        ];
      default:
        return [];
    }
  };

  return [
    ...onlyIf(q1 === "missing-product" || q1 === "missing-multiple", [
      "Week 1: Define your core product or service clearly before anything else",
    ]),
    ...onlyIf(q1 === "missing-customers", [
      "Week 1: Talk to at least 10 potential customers to confirm real demand",
    ]),
    ...onlyIf(q1 === "missing-payment", [
      "Week 1: Set up a payment method - PayPal, Stripe, Paystack, or bank transfer",
    ]),
    ...onlyIf(q3 === "no-validation", [
      "Week 1: Interview 10+ potential customers - ask if they would pay, not just if they like it",
    ]),
    ...onlyIf(q3 === "talked-no-payment", [
      "Week 1: Revisit conversations you have had and explicitly ask about willingness to pay",
    ]),
    ...onlyIf(q5 === "no", [
      "Week 1: Identify the core skill your business requires - develop it or find a partner who has it",
    ]),
    ...speedItems(),
    ...onlyIf(q7 === "passion-only", [
      "Week 1: Validate market demand before investing more time - passion alone does not pay the bills",
    ]),
    ...onlyIf(q7 === "demand-only", [
      "Consider whether you can sustain this long-term without passion - or find a co-founder who has it",
    ]),
    ...onlyIf(q4 === "over-1000" || q4 === "500-1000", [
      "Week 1: Audit your cost list - most early-stage businesses need far less than founders expect",
    ]),
    ...onlyIf(q10 === "maybe" || q10 === "no", [
      "Today: Write down the real reason you are hesitating - that is your first thing to fix",
    ]),
  ];
};

const levelItems = (
  level: ScoreLevel,
  earlierCount: number,
): readonly string[] => {
  switch (level) {
    case "green":
      return [
        ...onlyIf(earlierCount < 3, [
          "This week: Launch your minimum viable offer and collect your first payment",
          "This week: Set up your payment system and go-to-market process",
        ]),
        "Week 2: Start collecting customer feedback and iterate based on what you learn",
        "Week 3: Identify your top 3 acquisition channels and double down on what works",
      ];
    case "yellow":
      return [
        ...onlyIf(earlierCount < 3, [
          "Week 1: Write your one-sentence value proposition and test it with 5 real people",
          "Week 1: List every gap between where you are now and being ready to sell",
        ]),
        "Week 2: Address each gap systematically - do not move to the next until it is resolved",
        "Week 2: Set a hard launch date and make it public so you are accountable to it",
        'Week 3: Make your first sale - even at a reduced "founding customer" rate if needed',
      ];
    case "red":
      return [
        ...onlyIf(earlierCount < 4, [
          "Week 1: Interview 10 people about the problem you are solving - listen, do not pitch",
          "Week 1: List 10 skills people regularly ask you for help with",
          "Week 1: Research one person or business already doing what you want to do",
        ]),
        "Week 2: Clarify your value proposition - who you help, with what result, and how",
        "Week 2: Define the simplest version of your idea that someone could pay for today",
        "Week 2: Set up a basic way to receive payment before you need it",
        "Week 3: Make your first test offer to someone you know - even informally",
        "Week 3: Validate that at least one person would actually pay for what you are offering",
        "Week 4: Retake this assessment and measure your progress against these results",
      ];
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
};

const buildActionItems = (
  level: ScoreLevel,
  answers: Answers,
): readonly string[] => {
  const items = answerItems(answers);
  return [...items, ...levelItems(level, items.length)];
};

const buildTimeframe = (level: ScoreLevel, answers: Answers): string => {
  const q6 = textAt(answers, "speed");
  if (q6 === "months") {
    if (level === "green")
      return "Build your product, then launch - set a specific target date now";
    if (level === "yellow")
      return "Address gaps while building - set a realistic target launch date";
    return "Foundation work first, then build - plan for 2 to 3 months minimum";
  }
  if (q6 === "almost") {
    if (level === "green")
      return "Resolve remaining blockers and launch within 1 to 2 weeks";
    if (level === "yellow")
      return "Fix your gaps and launch within 2 to 3 weeks";
    return "3 to 4 weeks of foundation work before you are ready to launch";
  }
  switch (level) {
    case "green":
      return "Launch within 7 days";
    case "yellow":
      return "Fix gaps and launch within 2 weeks";
    case "red":
      return "3 to 4 weeks of focused foundation work, then launch";
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
};

const buildSummary = (
  level: ScoreLevel,
  positive: number,
  answers: Answers,
): string => {
  const monthsAway = textAt(answers, "speed") === "months";
  switch (level) {
    case "green":
      return monthsAway
        ? `You scored ${positive}/10. Strong foundations overall, but your product still needs time. Focus on defining a clear launch milestone and working towards it.`
        : `You scored ${positive}/10. You have the essentials in place. Time to execute.`;
    case "yellow":
      return monthsAway
        ? `You scored ${positive}/10. Good progress, but your product is not ready yet. Work through the gaps below while you continue building.`
        : `You scored ${positive}/10. You are close. A few gaps to address before you are ready to launch.`;
    case "red":
      return `You scored ${positive}/10. Several foundations need work before you are ready to launch. Work through the steps below before spending time or money on anything else.`;
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
};

/**
 * The scoring core: the original `calculateScore` plus `calculateDimensionScores`, with
 * no completeness check. The parity test calls this directly (spec 0005, AC-5).
 */
export const calculateScore = (answers: Answers): StellarScores => {
  const dimensions = calculateDimensionScores(answers);
  const positive = dimensions.filter((d) => d.score === 1).length;
  const level = levelFor(positive);
  return {
    level,
    score: Math.round((positive / 10) * 100),
    totalPositive: positive,
    title: titles[level],
    summary: buildSummary(level, positive, answers),
    actionItems: [...buildActionItems(level, answers)],
    timeframe: buildTimeframe(level, answers),
    dimensions,
  };
};

/**
 * The module's `score` (spec 0005, AC-6): only visible answers count, and an
 * unanswered visible question returns `incomplete`. Pure; never throws.
 */
export const scoreStellar = (
  answers: Answers,
): Result<StellarScores, ScoreError> => {
  const tool = { questions: stellarQuestions };
  const missing = missingAnswers(tool, answers);
  return missing.length > 0
    ? err({ code: "incomplete", missing })
    : ok(calculateScore(visibleAnswers(tool, answers)));
};
