/**
 * Beacon's band and category verdicts (spec 0010), shared by the report view and the
 * frozen v1 reader. Pure.
 */
import type { Verdict } from "../_contract";
import type { Band } from "./categories";

/** The header summary per band. */
export const bandLines: Readonly<Record<Band, string>> = {
  scale_ready: "Strong fundamentals across the board. You are ready to grow.",
  stable_foundation: "A solid base, with a few gaps to close before you scale.",
  building_blocks: "The basics are in place, and some key areas need work.",
  survival_mode:
    "Serious gaps are holding the business back. Focus on the essentials.",
  red_alert: "Urgent issues put the business at risk. Start with cash.",
};

export const bandVerdict = (band: Band): Verdict => {
  switch (band) {
    case "scale_ready":
    case "stable_foundation":
      return "good";
    case "building_blocks":
      return "caution";
    case "survival_mode":
    case "red_alert":
      return "risk";
    default: {
      const unreachable: never = band;
      return unreachable;
    }
  }
};

/** The band thresholds, on a category percentage. */
export const percentageVerdict = (percentage: number): Verdict =>
  percentage >= 70 ? "good" : percentage >= 50 ? "caution" : "risk";
