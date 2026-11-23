/**
 * Spec 0010, AC-4 and AC-6: completeness, and the advisory rules at their edges (built
 * from hand made scores, so each edge is exact).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAdvisory, type Advisory } from "./advisory";
import type { CategoryKey } from "./categories";
import { toAnswers } from "./parity-fixtures";
import { beaconQuestions } from "./questions";
import { scoreBeacon, type Category, type CoreScores } from "./scoring";

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../fixtures/parity/beacon/${name}`, import.meta.url),
      ),
      "utf8",
    ),
  );

const names: Readonly<Record<CategoryKey, string>> = {
  financial_health: "Financial Health",
  customer_strength: "Customer Strength",
  operational_maturity: "Operational Maturity",
  financial_intelligence: "Financial Intelligence",
  growth_resilience: "Growth & Resilience",
};

const cat = (key: CategoryKey, percentage: number): Category => ({
  name: names[key],
  score: percentage / 5,
  max: 20,
  percentage,
  grade: "C",
  insights: [],
});

const core = (
  pcts: Readonly<Record<CategoryKey, number>>,
  critical: readonly string[] = [],
): CoreScores => ({
  total: 60,
  band: "building_blocks",
  categories: {
    financial_health: cat("financial_health", pcts.financial_health),
    customer_strength: cat("customer_strength", pcts.customer_strength),
    operational_maturity: cat(
      "operational_maturity",
      pcts.operational_maturity,
    ),
    financial_intelligence: cat(
      "financial_intelligence",
      pcts.financial_intelligence,
    ),
    growth_resilience: cat("growth_resilience", pcts.growth_resilience),
  },
  flags: { critical: [...critical], opportunities: [] },
});

const even = {
  financial_health: 80,
  customer_strength: 80,
  operational_maturity: 80,
  financial_intelligence: 80,
  growth_resilience: 80,
};

const ANSWERS = {
  industry: "other",
  primary_pain_point: "too-busy-overwhelmed",
};

const section = (advisory: Advisory, heading: string) => {
  const found = advisory.sections.find((s) => s.heading === heading);
  if (!found) throw new Error(`no section ${heading}`);
  return found;
};

const subheadings = (advisory: Advisory): readonly string[] =>
  section(advisory, "Strategic Recommendations").parts.flatMap((p) =>
    p.kind === "subheading" ? [p.text] : [],
  );

describe("scoreBeacon (AC-4)", () => {
  const allBest = toAnswers(
    (
      loadFixture("reports.json") as {
        cases: { answers: Record<string, string> }[];
      }
    ).cases[0]?.answers ?? {},
  );

  it("returns incomplete with the missing id when one answer is left out", () => {
    const rest = Object.fromEntries(
      Object.entries(allBest).filter(([id]) => id !== "cash_runway"),
    );
    expect(scoreBeacon(rest)).toEqual({
      ok: false,
      error: { code: "incomplete", missing: ["cash_runway"] },
    });
  });

  it("lists every question when nothing is answered", () => {
    const result = scoreBeacon({});
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.missing).toEqual(beaconQuestions.map((q) => q.id));
  });

  it("returns the total, band, categories, flags and the advisory", () => {
    const result = scoreBeacon(allBest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(100);
    expect(result.value.band).toBe("scale_ready");
    expect(result.value.advisory.sections[0]?.heading).toBe(
      "Executive Summary",
    );
  });
});

describe("advisory rules (AC-6)", () => {
  it("keeps the fixed category order on a tie", () => {
    const advisory = buildAdvisory(
      core({ ...even, customer_strength: 40, growth_resilience: 40 }),
      ANSWERS,
    );
    expect(subheadings(advisory).slice(0, 2)).toEqual([
      "Build Customer Strength (Current: C)",
      "Build Growth & Resilience (Current: C)",
    ]);
  });

  it("adds the second category at 59.9, not at 60", () => {
    const at = (second: number) =>
      subheadings(
        buildAdvisory(
          core({ ...even, financial_health: 30, operational_maturity: second }),
          ANSWERS,
        ),
      );
    expect(at(59.9)).toContain("Systematize Operations (Current: C)");
    expect(at(60)).not.toContain("Systematize Operations (Current: C)");
  });

  it("shows the top 3 of 4 critical flags plus the note", () => {
    const advisory = buildAdvisory(
      core(even, [
        "CASH_CRISIS",
        "RUNWAY_CRITICAL",
        "NO_PROFIT_VISIBILITY",
        "FOUNDER_BURNOUT_RISK",
      ]),
      ANSWERS,
    );
    const parts = section(
      advisory,
      "🚨 Critical Priorities (Next 30 Days)",
    ).parts;
    expect(parts.flatMap((p) => (p.kind === "label" ? [p.text] : []))).toEqual([
      "CASH FLOW EMERGENCY",
      "RUNWAY EXTENSION REQUIRED",
      "PROFIT BLINDNESS",
    ]);
    expect(parts.at(-1)).toEqual({
      kind: "note",
      text: "Note: You have 4 critical issues flagged. Top 3 shown above.",
    });
  });

  it("has no note with exactly 3 critical flags", () => {
    const advisory = buildAdvisory(
      core(even, ["CASH_CRISIS", "RUNWAY_CRITICAL", "NO_PROFIT_VISIBILITY"]),
      ANSWERS,
    );
    const parts = section(
      advisory,
      "🚨 Critical Priorities (Next 30 Days)",
    ).parts;
    expect(parts.filter((p) => p.kind === "note")).toHaveLength(1);
  });

  it("adds nothing for an industry with no insight", () => {
    const advisory = buildAdvisory(core(even), ANSWERS);
    expect(
      subheadings(advisory).some((s) => s.startsWith("Industry Insight")),
    ).toBe(false);
  });

  it("skips the critical and opportunity sections when there are no flags", () => {
    const headings = buildAdvisory(core(even), ANSWERS).sections.map(
      (s) => s.heading,
    );
    expect(headings).toEqual([
      "Executive Summary",
      "Strategic Recommendations",
      "Your Next Steps",
    ]);
  });
});
