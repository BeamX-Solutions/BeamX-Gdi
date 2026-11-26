/**
 * Beacon Pro's report view (spec 0011, AC-12, AC-13). The preview (score, bars and
 * flags) needs only the scores, and the ready view is the preview plus one rich section
 * per advisory section, so nothing moves when the advisory lands. Pure.
 */
import type { ReportBlock, RichPart } from "../_contract";
import { bandLabels, categoryKeys } from "./categories";
import { flagLabel } from "./flags";
import { proSections, type ProContent, type ProPart } from "./pro-report";
import type { BeaconScores } from "./scoring";
import { bandLines, bandVerdict, percentageVerdict } from "./view";

export const PRO_TITLE = "Beacon Pro";

export const beaconProPreview = (
  scores: BeaconScores,
): readonly ReportBlock[] => [
  {
    kind: "score_header",
    title: PRO_TITLE,
    score: scores.total,
    max: 100,
    verdict: bandVerdict(scores.band),
    summary: `${bandLabels[scores.band]}. ${bandLines[scores.band]}`,
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
  ...(scores.flags.critical.length > 0
    ? [
        {
          kind: "bullets" as const,
          title: "Critical flags",
          items: scores.flags.critical.map(flagLabel),
        },
      ]
    : []),
  ...(scores.flags.opportunities.length > 0
    ? [
        {
          kind: "bullets" as const,
          title: "Opportunities",
          items: scores.flags.opportunities.map(flagLabel),
        },
      ]
    : []),
];

/** Drops absent optional keys, so parts stay plain data. */
const toRich = (part: ProPart): RichPart => {
  switch (part.kind) {
    case "paragraph":
      return part.lead === undefined
        ? { kind: "paragraph", text: part.text }
        : { kind: "paragraph", lead: part.lead, text: part.text };
    case "subheading":
    case "label":
    case "note":
      return { kind: part.kind, text: part.text };
    case "bullets":
    case "numbered":
      return {
        kind: part.kind,
        items: part.items.map((item) =>
          item.lead === undefined
            ? { text: item.text }
            : { lead: item.lead, text: item.text },
        ),
      };
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

export const beaconProView = ({
  scores,
  content,
}: {
  readonly scores: BeaconScores;
  readonly content: ProContent;
}): readonly ReportBlock[] => [
  ...beaconProPreview(scores),
  ...proSections.flatMap(({ key, heading }): ReportBlock[] => {
    const parts = content.advisory[key];
    return parts === null
      ? []
      : [{ kind: "rich_section", title: heading, parts: parts.map(toRich) }];
  }),
];
