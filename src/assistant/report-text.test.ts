import { describe, expect, it } from "vitest";
import { beaconReadyView, lunaReadyView } from "@/components/fixtures/report";
import { reportText, TRUNCATED_NOTE } from "./report-text";

// Spec 0014, AC-1 and AC-3.

describe("reportText", () => {
  it("writes every block as plain text, in order", () => {
    const { text, truncated } = reportText(beaconReadyView);
    expect(truncated).toBe(false);
    expect(text).toContain("Building Blocks: 60.3 of 100 (caution).");
    expect(text).toContain("- Financial Health (D): 5 of 20 (risk)");
    expect(text).toContain(
      "- [high] Less than 30 days cash runway (Financial Health)",
    );
    expect(text).toContain("Critical Priorities (Next 30 Days):");
    expect(text).toContain("1. Deal with your top critical priority first.");
    expect(text).toContain(
      "Recommended: 90-Day Business Transformation Program",
    );
    expect(text.indexOf("Building Blocks")).toBeLessThan(
      text.indexOf("Talk to BeamX"),
    );
  });

  it("draws a timeline and a long plan", () => {
    const { text } = reportText(lunaReadyView);
    expect(text).toContain("Implementation Roadmap:");
    expect(text).toContain("Investment and ROI:");
  });

  it("cuts a long report at a block boundary and says so", () => {
    const { text, truncated } = reportText(lunaReadyView, 1500);
    expect(truncated).toBe(true);
    expect(text.endsWith(TRUNCATED_NOTE)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(1500 + TRUNCATED_NOTE.length + 2);
  });

  it("is empty for no blocks", () => {
    expect(reportText([])).toEqual({ text: "", truncated: false });
  });
});
