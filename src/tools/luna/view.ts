/**
 * Luna's plan view (spec 0013, AC-11): the plan slices turned into existing report
 * blocks, in the standalone's section order. The analysis is never shown. A leading
 * `**Label:**` becomes a bold lead; any other `**` marker is dropped, since the renderer
 * draws plain text only. Em and en dashes become a spaced hyphen, as the standalone's
 * `stripEmDashes` does (generated copy may carry them, for example in money ranges). Pure.
 */
import type { ReportBlock, RichLine, RichPart } from "../_contract";
import type { LunaContent } from "./plan";

const BOLD_LEAD = /^\*\*([\s\S]+?)\*\*\s*([\s\S]*)$/;

const plain = (s: string): string =>
  s
    .replace(/\*\*/g, "")
    .replace(/\s*[–—]\s*/g, " - ")
    .trim();

/** "**Trigger:** if the close rate drops" → lead "Trigger:", text "if the close rate drops". */
export const splitLead = (s: string): RichLine => {
  const m = BOLD_LEAD.exec(s.trim());
  return m?.[1] !== undefined && m[2] !== undefined && m[2].trim() !== ""
    ? { lead: plain(m[1]), text: plain(m[2]) }
    : { text: plain(s) };
};

const paragraph = (s: string): RichPart => {
  const line = splitLead(s);
  return line.lead === undefined
    ? { kind: "paragraph", text: line.text }
    : { kind: "paragraph", lead: line.lead, text: line.text };
};

const callout = (c: {
  readonly title: string;
  readonly body: string;
}): readonly RichPart[] => [
  { kind: "label", text: plain(c.title) },
  { kind: "paragraph", tight: true, text: plain(c.body) },
];

const stats = (
  items: readonly { readonly value: string; readonly label: string }[],
): RichPart => ({
  kind: "bullets",
  items: items.map((s) => ({ lead: plain(s.value), text: plain(s.label) })),
});

const bullets = (items: readonly string[]): RichPart => ({
  kind: "bullets",
  items: items.map(splitLead),
});

const section = (title: string, parts: readonly RichPart[]): ReportBlock => ({
  kind: "rich_section",
  title,
  parts,
});

export const lunaView = ({
  content,
}: {
  readonly content: LunaContent;
}): readonly ReportBlock[] => {
  const { core, overview, operations, assets } = content;
  const summary = overview.executiveSummary;
  const journey = core.customerJourney;
  const insights = core.strategicInsights;
  const risks = core.risksPositioning;
  const { resources, kpis } = operations;
  const { templates, investmentRoi } = assets;
  return [
    section("Executive Summary", [
      stats(summary.stats),
      ...summary.paragraphs.map(paragraph),
      ...callout(summary.callout),
    ]),
    section("The Customer Journey", [
      paragraph(journey.intro),
      ...journey.stages.flatMap((stage): RichPart[] => [
        {
          kind: "subheading",
          text: `${plain(stage.step)} · ${plain(stage.sub)} (${plain(stage.tag)})`,
        },
        ...stage.columns.map((c): RichPart => ({
          kind: "paragraph",
          lead: `${plain(c.heading)}:`,
          text: plain(c.body),
        })),
      ]),
    ]),
    section("Strategic Insights", [
      { kind: "label", text: "Strengths to build on" },
      { ...bullets(insights.strengths), tight: true },
      { kind: "label", text: "Opportunities" },
      { ...bullets(insights.opportunities), tight: true },
    ]),
    section("Risks and Positioning", [
      {
        kind: "bullets",
        items: risks.risks.map((r) => ({
          lead: plain(r.label),
          text: plain(r.body),
        })),
      },
      paragraph(risks.positioning),
      ...callout(risks.callout),
    ]),
    {
      kind: "timeline",
      title: "Implementation Roadmap",
      steps: overview.implementation.phases.map((p) => ({
        label: `${plain(p.title)}, ${plain(p.when)}`,
        items: p.steps.map(plain),
      })),
    },
    section("Resources and Budget", [
      paragraph(resources.intro),
      stats(resources.stats),
      {
        kind: "bullets",
        items: resources.items.map((i) => ({
          lead: plain(i.label),
          text: plain(i.body),
        })),
      },
      ...callout(resources.callout),
    ]),
    section("Key Performance Indicators", [
      paragraph(kpis.intro),
      {
        kind: "bullets",
        items: kpis.rows.map((r) => ({
          lead: `${plain(r.metric)}:`,
          text: `${plain(r.target)} (tracked in ${plain(r.tracked)})`,
        })),
      },
      paragraph(kpis.note),
    ]),
    section("Templates and Tools", [
      paragraph(templates.intro),
      {
        kind: "numbered",
        items: templates.cards.map((c) => ({
          lead: `${plain(c.title)} (${plain(c.meta)}):`,
          text: plain(c.body),
        })),
      },
    ]),
    section("Investment and ROI", [
      paragraph(investmentRoi.intro),
      {
        kind: "bullets",
        items: investmentRoi.investments.map((i) => ({
          lead: `${plain(i.title)} (${plain(i.badge).replace(/\s*\n\s*/g, ", ")}):`,
          text: plain(i.body),
        })),
      },
      ...callout(investmentRoi.callout),
    ]),
  ];
};
