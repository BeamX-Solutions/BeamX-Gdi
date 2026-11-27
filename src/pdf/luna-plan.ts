/**
 * Luna's five content slices as the standalone's `Plan` (spec 0015, AC-2). Pure. Next
 * steps are not a phase of their own: they are the roadmap's first phase steps (up to
 * five) with an invitation to book a strategy call.
 */
import type { LunaContent } from "@/tools/luna/plan";
import type { Plan } from "./luna/types";

export const NEXT_STEPS_MAX = 5;
export const NEXT_STEPS_NOTE =
  "**Book a free strategy call with BeamX** to get started.";

export type PlanFacts = {
  readonly business: string;
  readonly industry: string;
  readonly model: string;
  /** "24 November 2026". */
  readonly date: string;
};

export const lunaPlan = (content: LunaContent, facts: PlanFacts): Plan => {
  const { core, overview, operations, assets } = content;
  const firstPhase = overview.implementation.phases[0];
  return {
    business: facts.business,
    industry: facts.industry,
    model: facts.model,
    date: facts.date,
    executiveSummary: overview.executiveSummary,
    customerJourney: core.customerJourney,
    strategicInsights: core.strategicInsights,
    risksPositioning: core.risksPositioning,
    implementation: overview.implementation,
    resources: operations.resources,
    kpis: operations.kpis,
    templates: assets.templates,
    investmentRoi: assets.investmentRoi,
    nextSteps: {
      steps: (firstPhase?.steps ?? []).slice(0, NEXT_STEPS_MAX),
      note: NEXT_STEPS_NOTE,
    },
  };
};
