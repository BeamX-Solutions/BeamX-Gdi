/**
 * Luna's plan slices (spec 0013, AC-5), ported from the standalone's `Plan` type
 * (fixtures/parity/luna/plan-shape.md). Each phase returns one slice. Schemas stay loose
 * on counts (structured output keeps the shape); the phase checks hold the counts the
 * standalone's prompts ask for. Strings may carry one leading `**bold**` label.
 */
import { z } from "zod";

const text = z.string().min(1).max(4000);
const accent = z.enum(["orange"]).optional();

const stat = z.object({ value: text, label: text, accent });
const callout = z.object({ title: text, body: text, accent });

/** Phase 1: the analysis, kept as context for later phases and never shown. */
export const analysisSchema = z.object({
  businessModelAssessment: text,
  marketOpportunity: text,
  competitivePositioning: text,
  customerAvatarRefinement: text,
  strategicRecommendations: z.array(text).min(1),
  riskFactors: z.array(text).min(1),
  growthPotential: text,
});

const stage = z.object({
  tag: text,
  sub: text,
  step: text,
  tone: z.enum(["before", "during", "after"]),
  columns: z.array(z.object({ heading: text, body: text })).min(1),
});

/** Phase 2: the customer journey, strategic insights, risks and positioning. */
export const coreSchema = z.object({
  customerJourney: z.object({ intro: text, stages: z.array(stage).min(1) }),
  strategicInsights: z.object({
    strengths: z.array(text).min(1),
    opportunities: z.array(text).min(1),
  }),
  risksPositioning: z.object({
    risks: z
      .array(
        z.object({
          severity: z.enum(["high", "medhigh", "med"]),
          label: text,
          body: text,
        }),
      )
      .min(1),
    positioning: text,
    callout,
  }),
});

/** Phase 3: the executive summary and the implementation roadmap. */
export const overviewSchema = z.object({
  executiveSummary: z.object({
    stats: z.array(stat).min(1),
    paragraphs: z.array(text).min(1),
    callout,
  }),
  implementation: z.object({
    intro: text,
    phases: z
      .array(
        z.object({
          code: text,
          title: text,
          when: text,
          steps: z.array(text).min(1),
        }),
      )
      .min(1),
  }),
});

/** Phase 4: resources and budget, and the KPI scorecard. */
export const operationsSchema = z.object({
  resources: z.object({
    intro: text,
    stats: z.array(stat).min(1),
    items: z.array(z.object({ label: text, body: text })).min(1),
    callout,
  }),
  kpis: z.object({
    intro: text,
    rows: z
      .array(z.object({ metric: text, tracked: text, target: text }))
      .min(1),
    note: text,
  }),
});

/** Phase 5: templates and the investment and ROI case. */
export const assetsSchema = z.object({
  templates: z.object({
    intro: text,
    cards: z
      .array(z.object({ index: text, title: text, meta: text, body: text }))
      .min(1),
  }),
  investmentRoi: z.object({
    intro: text,
    investments: z
      .array(z.object({ badge: text, title: text, body: text, accent }))
      .min(1),
    callout,
  }),
});

export const lunaContentSchema = z.object({
  analysis: analysisSchema,
  core: coreSchema,
  overview: overviewSchema,
  operations: operationsSchema,
  assets: assetsSchema,
});

export type Analysis = z.infer<typeof analysisSchema>;
export type Core = z.infer<typeof coreSchema>;
export type Overview = z.infer<typeof overviewSchema>;
export type Operations = z.infer<typeof operationsSchema>;
export type Assets = z.infer<typeof assetsSchema>;
export type LunaContent = z.infer<typeof lunaContentSchema>;
