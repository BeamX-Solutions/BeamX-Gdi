/**
 * Spec 0015, AC-2 to AC-4: real PDFs from a Beacon report's blocks and from a Luna
 * plan (the standalone's example plan, split into Luna's slices).
 */
import { describe, expect, it } from "vitest";
import examplePlan from "../../fixtures/parity/luna/example-plan.json";
import { beaconAdvisoryView } from "@/components/fixtures/report";
import { lunaContentSchema } from "@/tools/luna/plan";
import { reportPdf } from ".";
import { lunaPlan, NEXT_STEPS_MAX, NEXT_STEPS_NOTE } from "./luna-plan";

const plan = examplePlan.plan;

const content = lunaContentSchema.parse({
  analysis: {
    businessModelAssessment: "-",
    marketOpportunity: "-",
    competitivePositioning: "-",
    customerAvatarRefinement: "-",
    strategicRecommendations: ["-"],
    riskFactors: ["-"],
    growthPotential: "-",
  },
  core: {
    customerJourney: plan.customerJourney,
    strategicInsights: plan.strategicInsights,
    risksPositioning: plan.risksPositioning,
  },
  overview: {
    executiveSummary: plan.executiveSummary,
    implementation: plan.implementation,
  },
  operations: { resources: plan.resources, kpis: plan.kpis },
  assets: { templates: plan.templates, investmentRoi: plan.investmentRoi },
});

const facts = {
  business: "Ada's Kitchen",
  industry: "Restaurants & Food Service",
  model: "B2B",
  date: "27 November 2026",
};

const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

describe("lunaPlan (AC-2)", () => {
  it("carries the slices and builds next steps from the first roadmap phase", () => {
    const built = lunaPlan(content, facts);
    expect(built.business).toBe("Ada's Kitchen");
    expect(built.kpis).toEqual(content.operations.kpis);
    expect(built.nextSteps.steps).toEqual(
      (content.overview.implementation.phases[0]?.steps ?? []).slice(
        0,
        NEXT_STEPS_MAX,
      ),
    );
    expect(built.nextSteps.note).toBe(NEXT_STEPS_NOTE);
  });
});

describe("reportPdf (AC-2, AC-3, AC-4)", () => {
  it("renders a Beacon report's blocks as a PDF", async () => {
    const pdf = await reportPdf({
      kind: "blocks",
      toolName: "Beacon",
      business: "Ada Foods",
      date: "27 November 2026",
      blocks: beaconAdvisoryView,
    });
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(10_000);
  }, 60_000);

  it("renders a Luna plan in the ported layout", async () => {
    const pdf = await reportPdf({ kind: "luna", content, facts });
    expect(isPdf(pdf)).toBe(true);
    // Cover, contents and eight sections run to several pages.
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(5);
  }, 60_000);
});
