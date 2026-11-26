/**
 * Beacon scoring (spec 0010, kept by v2 in spec 0011). Ported from
 * `calculate_beacon_score` and its insight generators in beamx-scorecard `main.py` at
 * the fixture's recorded commit. Rules compare stored option values (slugs), so a label
 * copy change never changes a score.
 *
 * Pure: answers in, scores out.
 */
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import type { Answers, ScoreError } from "../_contract";
import { missingAnswers, visibleAnswers } from "../_kit/flow";
import { bands, type Band } from "./categories";
import { beaconQuestions } from "./questions";

const categorySchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(20),
  max: z.literal(20),
  percentage: z.number().min(0).max(100),
  grade: z.string(),
  insights: z.array(z.string()),
});

export type Category = z.infer<typeof categorySchema>;

export const beaconScoresSchema = z.object({
  total: z.number().min(0).max(100),
  band: z.enum(bands),
  categories: z.object({
    financial_health: categorySchema,
    customer_strength: categorySchema,
    operational_maturity: categorySchema,
    financial_intelligence: categorySchema,
    growth_resilience: categorySchema,
  }),
  flags: z.object({
    critical: z.array(z.string()),
    opportunities: z.array(z.string()),
  }),
});

export type BeaconScores = z.infer<typeof beaconScoresSchema>;

/** The scores before completeness is checked (same shape since v2, spec 0011). */
export type CoreScores = BeaconScores;

/** Points per answer, by question id and option value (the original's score maps). */
const scoreMaps = {
  cash_flow: {
    "consistent-surplus": 5,
    "breaking-even": 3,
    "unpredictable-some-surplus-some-deficit": 2,
    "burning-cash-consistently": 0,
    "dont-know": 0,
  },
  profit_margin: {
    "30-pct-plus": 5,
    "20-30-pct": 4,
    "10-20-pct": 3,
    "5-10-pct": 2,
    "less-than-5-pct-or-negative": 1,
    "dont-know": 0,
  },
  cash_runway: {
    "6-plus-months": 5,
    "3-6-months": 4,
    "1-3-months": 2,
    "less-than-1-month": 1,
    "would-close-immediately": 0,
  },
  payment_speed: {
    "same-day-cash-instant": 5,
    "1-7-days": 4,
    "8-30-days": 3,
    "31-60-days": 1,
    "60-plus-days": 0,
  },
  repeat_customer_rate: {
    "70-pct-plus-repeat-customers": 5,
    "50-70-pct-repeat": 4,
    "30-50-pct-repeat": 3,
    "10-30-pct-repeat": 2,
    "less-than-10-pct-repeat": 0,
  },
  acquisition_channel: {
    "referrals-word-of-mouth": 5,
    "repeat-business-relationships": 5,
    "walk-ins-location-visibility": 3,
    "organic-social-media": 3,
    "paid-advertising": 2,
    "cold-outreach": 1,
    "dont-know": 0,
  },
  pricing_power: {
    "tested-increases-successfully": 5,
    "most-customers-would-stay": 4,
    "some-would-leave-but-still-profitable": 3,
    "would-lose-most-customers": 1,
    "dont-know": 1,
  },
  founder_dependency: {
    "runs-2-plus-weeks-without-me": 5,
    "can-step-away-1-week": 4,
    "2-3-days-max": 3,
    "cant-miss-even-1-day": 1,
    "must-be-there-daily": 0,
  },
  process_documentation: {
    "comprehensive-written-processes": 5,
    "some-key-processes-documented": 4,
    "trained-others-mostly-in-my-head": 2,
    "everything-in-my-head-only": 1,
    "no-consistent-processes": 0,
  },
  inventory_tracking: {
    "digital-real-time-system": 5,
    "regular-manual-spreadsheet": 4,
    "weekly-physical-count": 3,
    "only-when-running-low": 1,
    "dont-track": 0,
    "not-applicable-service-business": 4,
  },
  expense_awareness: {
    "know-exact-amounts-and-percentages": 5,
    "know-roughly": 4,
    "general-idea": 3,
    "would-have-to-look-up": 1,
    "no-idea": 0,
  },
  profit_per_product: {
    "know-margins-on-each-offering": 5,
    "good-sense-of-whats-profitable": 4,
    "know-revenue-only-not-profit": 2,
    "havent-analyzed": 1,
    "all-seem-about-the-same": 1,
  },
  pricing_strategy: {
    "cost-plus-margin-plus-market-research": 5,
    "match-competitors": 3,
    "cost-plus-markup-no-market-analysis": 2,
    "what-feels-right": 1,
    "no-strategy": 0,
  },
  business_trajectory: {
    "growing-20-pct-plus": 5,
    "growing-5-20-pct": 4,
    "stable-5-pct": 3,
    "declining-5-20-pct": 1,
    "declining-20-pct-plus": 0,
    "less-than-1-year-old": 2,
  },
  revenue_diversification: {
    "4-plus-streams-customer-types": 5,
    "2-3-streams": 4,
    "primary-plus-side-income": 3,
    "single-product-customer-type": 2,
    "dependent-on-1-2-major-customers": 0,
  },
  digital_payments: {
    "80-pct-plus-digital": 5,
    "50-80-pct-digital": 4,
    "20-50-pct-digital": 2,
    "less-than-20-pct-digital": 1,
  },
  formal_registration: {
    "fully-registered-and-tax-compliant": 5,
    "registered-behind-on-taxes": 3,
    "in-process-of-registering": 2,
    "not-registered": 0,
  },
  infrastructure: {
    "consistent-power-internet-supply": 5,
    "mostly-reliable-with-backups": 4,
    "frequent-disruptions": 2,
    "major-challenges-daily": 0,
  },
  banking_relationship: {
    "strong-accessed-loans-credit": 5,
    "accounts-but-no-credit": 3,
    "minimal-interaction": 1,
    "no-bank-relationship": 0,
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, number>>>>;

type ScoredId = keyof typeof scoreMaps;

/** The stored value of a question, or "" when unanswered. */
export const answerAt = (answers: Answers, id: string): string => {
  const value = answers[id];
  return typeof value === "string" ? value : "";
};

const points = (answers: Answers, id: ScoredId): number => {
  const map: Readonly<Record<string, number>> = scoreMaps[id];
  return map[answerAt(answers, id)] ?? 0;
};

/** Python's `round(x, 1)`; the fixtures record that half up never differs here. */
export const round1 = (x: number): number => Math.round(x * 10) / 10;

const gradeOf = (pct: number): string => {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B+";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C+";
  if (pct >= 50) return "C";
  return "D";
};

export const bandOf = (total: number): Band => {
  if (total >= 85) return "scale_ready";
  if (total >= 70) return "stable_foundation";
  if (total >= 50) return "building_blocks";
  if (total >= 30) return "survival_mode";
  return "red_alert";
};

/** Matches when the answer to `id` is one of `values`; `text` is what it adds. */
type Rule = readonly [id: string, values: readonly string[], text: string];

const matches = (answers: Answers, [id, values]: Rule): boolean =>
  values.includes(answerAt(answers, id));

/**
 * Each inner list is one if/elif chain of the original: the first rule that matches
 * adds its text, and the rest of that chain is skipped.
 */
const insightsFrom = (
  answers: Answers,
  chains: readonly (readonly Rule[])[],
): readonly string[] =>
  chains.flatMap((chain) => {
    const hit = chain.find((rule) => matches(answers, rule));
    return hit ? [hit[2]] : [];
  });

/** Every rule that matches adds its flag, in the original's order. */
const flagsFrom = (answers: Answers, rules: readonly Rule[]): string[] =>
  rules.filter((rule) => matches(answers, rule)).map((rule) => rule[2]);

const fhInsights = (a: Answers) =>
  insightsFrom(a, [
    [
      [
        "cash_flow",
        ["consistent-surplus"],
        "Strong cash flow discipline - foundation for growth",
      ],
      [
        "cash_flow",
        ["burning-cash-consistently"],
        "Burning cash monthly - immediate action required",
      ],
      [
        "cash_flow",
        ["dont-know"],
        "No cash flow tracking - serious financial risk",
      ],
    ],
    [
      [
        "profit_margin",
        ["30-pct-plus", "20-30-pct"],
        "Healthy profit margins - room to invest and weather storms",
      ],
      [
        "profit_margin",
        ["5-10-pct", "less-than-5-pct-or-negative"],
        "Thin margins - vulnerable to any cost increases",
      ],
      [
        "profit_margin",
        ["dont-know"],
        "Unknown profitability - you cannot make informed decisions",
      ],
    ],
    [
      [
        "cash_runway",
        ["less-than-1-month", "would-close-immediately"],
        "CRITICAL: Less than 30 days cash runway",
      ],
      [
        "cash_runway",
        ["6-plus-months"],
        "Strong cash reserves - positioned for opportunities",
      ],
    ],
    [
      [
        "payment_speed",
        ["31-60-days", "60-plus-days"],
        "Slow payment collection is straining cash flow",
      ],
      [
        "payment_speed",
        ["same-day-cash-instant"],
        "Fast payment collection - excellent cash velocity",
      ],
    ],
  ]);

const csInsights = (a: Answers) =>
  insightsFrom(a, [
    [
      [
        "repeat_customer_rate",
        ["70-pct-plus-repeat-customers"],
        "Exceptional customer loyalty - strong retention foundation",
      ],
      [
        "repeat_customer_rate",
        ["less-than-10-pct-repeat"],
        "Low repeat business - acquisition treadmill is expensive",
      ],
    ],
    [
      [
        "acquisition_channel",
        ["referrals-word-of-mouth", "repeat-business-relationships"],
        "Organic acquisition - sustainable and low-cost growth engine",
      ],
      [
        "acquisition_channel",
        ["paid-advertising"],
        "Paid-dependent growth - vulnerable if ad budget must be cut",
      ],
      [
        "acquisition_channel",
        ["dont-know"],
        "Unknown acquisition source - you cannot optimize what you don't track",
      ],
    ],
    [
      [
        "pricing_power",
        ["tested-increases-successfully"],
        "Proven pricing power - differentiated from competition",
      ],
      [
        "pricing_power",
        ["would-lose-most-customers"],
        "Commoditized offering - competing on price alone",
      ],
    ],
  ]);

const omInsights = (a: Answers) =>
  insightsFrom(a, [
    [
      [
        "founder_dependency",
        ["must-be-there-daily"],
        "Business cannot run without you - burnout risk and zero scale potential",
      ],
      [
        "founder_dependency",
        ["runs-2-plus-weeks-without-me"],
        "Business independence achieved - scalable operations",
      ],
    ],
    [
      [
        "process_documentation",
        ["comprehensive-written-processes"],
        "Strong documentation - ready to train, delegate, and scale",
      ],
      [
        "process_documentation",
        ["everything-in-my-head-only", "no-consistent-processes"],
        "Tribal knowledge only - vulnerable to any key person leaving",
      ],
    ],
    [
      [
        "inventory_tracking",
        ["digital-real-time-system"],
        "Real-time inventory visibility - optimal stock management",
      ],
      [
        "inventory_tracking",
        ["dont-track"],
        "No inventory tracking - likely experiencing costly stockouts or overstock",
      ],
    ],
  ]);

const fiInsights = (a: Answers) =>
  insightsFrom(a, [
    [
      [
        "expense_awareness",
        ["know-exact-amounts-and-percentages"],
        "Strong cost control discipline - ready to optimize",
      ],
      [
        "expense_awareness",
        ["would-have-to-look-up", "no-idea"],
        "Weak expense visibility - almost certainly leaving money on the table",
      ],
    ],
    [
      [
        "profit_per_product",
        ["know-margins-on-each-offering"],
        "Margin awareness - you can focus effort on your most profitable offerings",
      ],
      [
        "profit_per_product",
        ["havent-analyzed", "all-seem-about-the-same"],
        "No margin analysis - you may be subsidizing loss-makers with your winners",
      ],
    ],
    [
      [
        "pricing_strategy",
        ["cost-plus-margin-plus-market-research"],
        "Strategic pricing approach - maximizing value capture",
      ],
      [
        "pricing_strategy",
        ["what-feels-right", "no-strategy"],
        "Arbitrary pricing - you are likely undercharging or mispricing",
      ],
    ],
  ]);

const grInsights = (a: Answers) =>
  insightsFrom(a, [
    [
      [
        "business_trajectory",
        ["growing-20-pct-plus", "growing-5-20-pct"],
        "Positive growth trajectory - strong market validation",
      ],
      [
        "business_trajectory",
        ["declining-5-20-pct", "declining-20-pct-plus"],
        "Declining revenue - urgent strategic review needed",
      ],
    ],
    [
      [
        "revenue_diversification",
        ["dependent-on-1-2-major-customers"],
        "Customer concentration risk - one lost client could cripple the business",
      ],
      [
        "revenue_diversification",
        ["4-plus-streams-customer-types"],
        "Well-diversified revenue - resilient to market shifts",
      ],
    ],
    [
      [
        "digital_payments",
        ["80-pct-plus-digital", "50-80-pct-digital"],
        "Strong digital payment adoption - good transaction visibility",
      ],
      [
        "digital_payments",
        ["less-than-20-pct-digital"],
        "Cash-heavy operations - limited data visibility",
      ],
    ],
    [
      [
        "formal_registration",
        ["fully-registered-and-tax-compliant"],
        "Fully formalized - eligible for credit, partnerships, and major contracts",
      ],
      [
        "formal_registration",
        ["not-registered"],
        "Informal operations - locked out of growth capital and corporate clients",
      ],
    ],
    [
      [
        "infrastructure",
        ["major-challenges-daily"],
        "Daily infrastructure disruptions are hurting operational efficiency",
      ],
    ],
    [
      [
        "banking_relationship",
        ["strong-accessed-loans-credit"],
        "Banking access established - growth capital is available to you",
      ],
    ],
  ]);

const criticalRules: readonly Rule[] = [
  ["cash_flow", ["burning-cash-consistently", "dont-know"], "CASH_CRISIS"],
  [
    "cash_runway",
    ["less-than-1-month", "would-close-immediately"],
    "RUNWAY_CRITICAL",
  ],
  [
    "profit_margin",
    ["less-than-5-pct-or-negative", "dont-know"],
    "NO_PROFIT_VISIBILITY",
  ],
  ["founder_dependency", ["must-be-there-daily"], "FOUNDER_BURNOUT_RISK"],
  ["formal_registration", ["not-registered"], "INFORMAL_OPERATIONS"],
  ["repeat_customer_rate", ["less-than-10-pct-repeat"], "NO_CUSTOMER_LOYALTY"],
];

const opportunityRules: readonly Rule[] = [
  [
    "pricing_power",
    ["tested-increases-successfully", "most-customers-would-stay"],
    "PRICING_POWER",
  ],
  [
    "repeat_customer_rate",
    ["70-pct-plus-repeat-customers"],
    "STRONG_RETENTION",
  ],
  [
    "acquisition_channel",
    ["referrals-word-of-mouth", "repeat-business-relationships"],
    "ORGANIC_GROWTH",
  ],
  [
    "process_documentation",
    ["comprehensive-written-processes"],
    "SYSTEMS_READY",
  ],
];

const makeCategory = (
  name: string,
  score: number,
  insights: readonly string[],
): Category => {
  const percentage = round1((score / 20) * 100);
  return {
    name,
    score: round1(score),
    max: 20,
    percentage,
    grade: gradeOf(percentage),
    insights: [...insights],
  };
};

const sum = (a: Answers, ids: readonly ScoredId[]): number =>
  ids.reduce((total, id) => total + points(a, id), 0);

/** The original's scoring over complete, visible answers. */
export const calculateScore = (a: Answers): CoreScores => {
  const fh =
    (sum(a, ["cash_flow", "profit_margin", "cash_runway", "payment_speed"]) /
      20) *
    20;
  const cs =
    (sum(a, ["repeat_customer_rate", "acquisition_channel", "pricing_power"]) /
      15) *
    20;
  const om =
    (sum(a, [
      "founder_dependency",
      "process_documentation",
      "inventory_tracking",
    ]) /
      15) *
    20;
  const fi =
    (sum(a, ["expense_awareness", "profit_per_product", "pricing_strategy"]) /
      15) *
    20;
  const grBase =
    (sum(a, ["business_trajectory", "revenue_diversification"]) / 10) * 12;
  const context =
    (points(a, "digital_payments") / 5) * 2 +
    (points(a, "formal_registration") / 5) * 3 +
    (points(a, "infrastructure") / 5) * 2 +
    (points(a, "banking_relationship") / 5) * 1;
  const gr = grBase + context;
  const total = fh + cs + om + fi + gr;

  return {
    total: round1(total),
    band: bandOf(total),
    categories: {
      financial_health: makeCategory("Financial Health", fh, fhInsights(a)),
      customer_strength: makeCategory("Customer Strength", cs, csInsights(a)),
      operational_maturity: makeCategory(
        "Operational Maturity",
        om,
        omInsights(a),
      ),
      financial_intelligence: makeCategory(
        "Financial Intelligence",
        fi,
        fiInsights(a),
      ),
      growth_resilience: makeCategory("Growth & Resilience", gr, grInsights(a)),
    },
    flags: {
      critical: flagsFrom(a, criticalRules),
      opportunities: [
        ...flagsFrom(a, opportunityRules),
        ...(fh >= 16 ? ["FINANCIAL_DISCIPLINE"] : []),
      ],
    },
  };
};

/** The scores, computed once at completion (spec 0010, AC-4; no advisory since v2). */
export const scoreBeacon = (
  answers: Answers,
): Result<BeaconScores, ScoreError> => {
  const tool = { questions: beaconQuestions };
  const missing = missingAnswers(tool, answers);
  if (missing.length > 0) return err({ code: "incomplete", missing });
  const visible = visibleAnswers(tool, answers);
  return ok(calculateScore(visible));
};
