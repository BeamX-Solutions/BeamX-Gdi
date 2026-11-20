import type {
  AdviceItem,
  CategoryBarItem,
  ReportBlock,
  SkeletonStep,
  Verdict,
} from "@/components/report/types";
import type { ErrorKind } from "@/components/feedback/error-card";
import {
  reportErrorCopy,
  type ReportErrorViewKind,
} from "@/components/feedback/error-copy";
import type { ReportPayload } from "@/components/report/report-payload";

export type ReportFixture = {
  readonly verdict: Verdict;
  readonly verdictLabel: string;
  readonly score: number;
  readonly max: number;
  readonly summary: string;
  readonly bars: readonly CategoryBarItem[];
};

/** One finished report per verdict. The tool picks its own label (Stellar says "Green"). */
export const reportFixtures: Readonly<Record<Verdict, ReportFixture>> = {
  good: {
    verdict: "good",
    verdictLabel: "Healthy",
    score: 86,
    max: 100,
    summary: "Your business is in good shape. Keep an eye on cash flow.",
    bars: [
      { label: "Sales and marketing", score: 9, max: 10, verdict: "good" },
      { label: "Money and cash flow", score: 8, max: 10, verdict: "good" },
      { label: "Operations", score: 8, max: 10, verdict: "good" },
    ],
  },
  caution: {
    verdict: "caution",
    verdictLabel: "Needs work",
    score: 62,
    max: 100,
    summary:
      "Your idea scores well on demand and needs work on cost control and delivery.",
    bars: [
      { label: "Demand for the idea", score: 8, max: 10, verdict: "good" },
      { label: "Cost control", score: 5, max: 10, verdict: "caution" },
      { label: "Delivery plan", score: 3, max: 10, verdict: "risk" },
    ],
  },
  risk: {
    verdict: "risk",
    verdictLabel: "At risk",
    score: 28,
    max: 100,
    summary:
      "Several parts of the business need attention before you spend more.",
    bars: [
      { label: "Sales and marketing", score: 3, max: 10, verdict: "risk" },
      { label: "Money and cash flow", score: 2, max: 10, verdict: "risk" },
      { label: "Operations", score: 4, max: 10, verdict: "caution" },
    ],
  },
};

/** Plain bars with no verdict: they fill with the primary color. */
export const plainBars: readonly CategoryBarItem[] = [
  { label: "Answered so far", score: 6, max: 10 },
  { label: "Clamped above max", score: 14, max: 10 },
  { label: "Empty", score: 0, max: 10 },
];

export const adviceItems: readonly AdviceItem[] = [
  {
    title: "Test delivery with ten customers first",
    detail:
      "Deliver by hand for two weeks before you buy a bike or hire a rider.",
    priority: "high",
  },
  {
    title: "Write down what each loaf costs you",
    detail: "Flour, gas, packaging, and your own time. Price from that number.",
    priority: "medium",
  },
  { title: "Ask your best customers for a referral", priority: "low" },
];

export const sectionMarkdown =
  "## What the numbers say\n\nYour **demand score is high**. People already buy bread near you, and three said they would pay more for delivery.\n\n" +
  "1. Start with one street.\n2. Track every order for a month.\n3. Raise prices by 5% if you sell out.\n\n" +
  "Read more in [our guide](https://example.com/guide).";

export const streamingSectionMarkdown =
  "Your **demand score is high**. People already buy bread near you, and three said they would pay";

export const skeletonSteps: readonly SkeletonStep[] = [
  { label: "Reading your answers", state: "done" },
  { label: "Scoring each area", state: "active" },
  { label: "Writing your advice", state: "pending" },
  { label: "Putting the report together", state: "pending" },
];

export const skeletonAllDone: readonly SkeletonStep[] = skeletonSteps.map(
  (step) => ({ ...step, state: "done" as const }),
);

export const errorKinds: readonly ErrorKind[] = [
  "ai_error",
  "network",
  "limit_reached",
  "spend_cap",
];

// ---------------------------------------------------------------------------
// Report panel states (spec 0005, AC-11): one status payload per state
// ---------------------------------------------------------------------------

/** A ready report using every block kind. Two resource links are unsafe on purpose. */
export const allBlocksView: readonly ReportBlock[] = [
  {
    kind: "score_header",
    title: "Promising, with a few gaps",
    score: 74,
    max: 100,
    verdict: "caution",
    summary: "People want this. Test delivery and costs before you spend more.",
  },
  {
    kind: "category_bars",
    title: "Your ten checks",
    items: [
      { label: "Market validation", score: 10, max: 10, verdict: "good" },
      { label: "Skills", score: 0, max: 10, verdict: "risk" },
    ],
  },
  {
    kind: "advice_list",
    title: "Your next steps",
    items: [
      { title: "Sell ten loaves to neighbours this week", priority: "high" },
      { title: "Write down what each loaf costs", priority: "medium" },
    ],
  },
  {
    kind: "text",
    title: "Your plan",
    paragraphs: [
      "Start small on one street and deliver by hand.",
      "Read [this](https://example.com) as plain text, not a link.",
    ],
  },
  {
    kind: "bullets",
    title: "Strengths",
    items: ["You already have buyers", "You know the area well"],
  },
  {
    kind: "timeline",
    title: "Your roadmap",
    steps: [
      { label: "Week 1", items: ["Bake a test batch", "Ask five neighbours"] },
      { label: "Week 2", items: ["Take ten orders"] },
    ],
  },
  {
    kind: "resources",
    title: "Resources",
    items: [
      {
        title: "Pricing guide",
        description: "How to price from your real costs.",
        url: "https://example.com/pricing",
      },
      {
        title: "Plain http guide",
        description: "Shown as text: not https.",
        url: "http://example.com/guide",
      },
      {
        title: "Script link",
        description: "Shown as text: not a web link.",
        url: "javascript:alert(1)",
      },
      { title: "Ask a mentor", description: "No link at all.", url: null },
    ],
  },
];

const stellarPhases = [{ label: "Writing your analysis" }] as const;

const threePhases = [
  { label: "Reading your answers" },
  { label: "Writing your advice" },
  { label: "Putting the report together" },
] as const;

const phases = (
  list: readonly { readonly label: string }[],
  done: number,
): ReportPayload["phases"] =>
  list.map((p, index) => ({ label: p.label, done: index < done }));

const reportError = (kind: ReportErrorViewKind) => ({
  kind,
  ...reportErrorCopy[kind],
});

export const panelPayloads = {
  generating: {
    status: "generating",
    phases: phases(threePhases, 1),
    error: null,
    canRetry: false,
    stale: false,
  },
  failed: {
    status: "failed",
    phases: phases(threePhases, 1),
    error: reportError("provider_overloaded"),
    canRetry: true,
    stale: false,
  },
  exhausted: {
    status: "failed",
    phases: phases(stellarPhases, 0),
    error: reportError("exhausted"),
    canRetry: false,
    stale: false,
  },
  ready: {
    status: "ready",
    phases: phases(stellarPhases, 1),
    error: null,
    canRetry: false,
    stale: false,
    view: [...allBlocksView],
  },
} as const satisfies Readonly<Record<string, ReportPayload>>;
