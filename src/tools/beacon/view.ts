/**
 * Beacon's report view (spec 0010, AC-9, AC-10): scores and the rewritten advisory
 * turned into report blocks. Pure.
 */
import type { AdviceItem, ReportBlock, RichPart, Verdict } from "../_contract";
import { BOOKING_TEXT, type Part } from "./advisory";
import {
  bandLabels,
  categoryKeys,
  weakestFirst,
  type Band,
} from "./categories";
import type { BeaconContent } from "./report";
import type { BeaconScores } from "./scoring";

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

const CRITICAL = "CRITICAL: ";

const finding = (insight: string, category: string): AdviceItem =>
  insight.startsWith(CRITICAL)
    ? {
        title: insight.slice(CRITICAL.length),
        detail: category,
        priority: "high",
      }
    : { title: insight, detail: category, priority: "low" };

const isRich = (part: Part): part is Exclude<Part, { kind: "link" }> =>
  part.kind !== "link";

/** Drops `tight: undefined` and other absent keys, so parts stay plain data. */
const toRich = (part: Exclude<Part, { kind: "link" }>): RichPart => {
  const tight = part.tight ? { tight: true as const } : {};
  switch (part.kind) {
    case "paragraph":
      return part.lead === undefined
        ? { ...tight, kind: "paragraph", text: part.text }
        : { ...tight, kind: "paragraph", lead: part.lead, text: part.text };
    case "note":
    case "label":
    case "subheading":
      return { ...tight, kind: part.kind, text: part.text };
    case "bullets":
    case "numbered":
      return {
        ...tight,
        kind: part.kind,
        items: part.items.map((item) =>
          item.lead === undefined
            ? { text: item.text }
            : { lead: item.lead, text: item.text },
        ),
      };
    case "rule":
      return { ...tight, kind: "rule" };
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

export const beaconView = ({
  scores,
  content,
}: {
  readonly scores: BeaconScores;
  readonly content: BeaconContent;
}): readonly ReportBlock[] => {
  const { sections } = content.advisory;
  const links = sections.flatMap((s) =>
    s.parts.flatMap((p) => (p.kind === "link" ? [p] : [])),
  );
  return [
    {
      kind: "score_header",
      title: bandLabels[scores.band],
      score: scores.total,
      max: 100,
      verdict: bandVerdict(scores.band),
      summary: bandLines[scores.band],
    },
    {
      kind: "category_bars",
      title: "Your five areas",
      items: categoryKeys.map((key) => {
        const c = scores.categories[key];
        return {
          label: `${c.name} (${c.grade})`,
          score: c.score,
          max: 20,
          verdict: percentageVerdict(c.percentage),
        };
      }),
    },
    {
      kind: "advice_list",
      title: "What we found",
      items: weakestFirst(scores.categories).flatMap(([, c]) =>
        c.insights.map((insight) => finding(insight, c.name)),
      ),
    },
    ...sections.map((section): ReportBlock => ({
      kind: "rich_section",
      title: section.heading,
      parts: section.parts.filter(isRich).map(toRich),
    })),
    {
      kind: "resources",
      title: "Talk to BeamX",
      items: links.map((link) => ({
        title: link.text,
        description: BOOKING_TEXT,
        url: link.url,
      })),
    },
  ];
};
