/**
 * Beacon v1's report view (spec 0010, AC-9, AC-10), frozen (spec 0011): stored v1
 * scores and the rewritten rule advisory turned into report blocks. Pure.
 */
import type { AdviceItem, ReportBlock, RichPart } from "../_contract";
import { bandLabels, categoryKeys, weakestFirst } from "./categories";
import { bandLines, bandVerdict, percentageVerdict } from "./verdicts";
import { BOOKING_TEXT, type Part } from "./v1-schema";
import type { BeaconV1Content, BeaconV1Scores } from "./v1-reader";

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

export const beaconV1View = ({
  scores,
  content,
}: {
  readonly scores: BeaconV1Scores;
  readonly content: BeaconV1Content;
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
