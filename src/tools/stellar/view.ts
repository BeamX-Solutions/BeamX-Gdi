/**
 * Stellar's report view (spec 0005): scores and the analysis turned into report blocks.
 * Pure. Em dashes in AI text become a spaced hyphen, as the original did.
 */
import type { ReportBlock, Verdict } from "../_contract";
import type { StellarContent } from "./report";
import type { ScoreLevel, StellarScores } from "./scoring";

const verdictOf = (level: ScoreLevel): Verdict => {
  switch (level) {
    case "green":
      return "good";
    case "yellow":
      return "caution";
    case "red":
      return "risk";
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
};

const clean = (text: string): string => text.replace(/\s*—\s*/g, " - ");

const paragraphs = (text: string): string[] =>
  clean(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

export const stellarView = ({
  scores,
  content,
}: {
  readonly scores: StellarScores;
  readonly content: StellarContent;
}): readonly ReportBlock[] => {
  const { analysis } = content;
  return [
    {
      kind: "score_header",
      title: scores.title,
      score: scores.score,
      max: 100,
      verdict: verdictOf(scores.level),
      summary: scores.summary,
    },
    {
      kind: "category_bars",
      title: "Your ten checks",
      items: scores.dimensions.map((d) => ({
        label: d.name,
        score: d.score,
        max: d.maxScore,
        verdict: d.score === d.maxScore ? "good" : "risk",
      })),
    },
    {
      kind: "advice_list",
      title: "Your next steps",
      items: scores.actionItems.map((title, index) => ({
        title,
        priority: index < 2 ? "high" : "medium",
      })),
    },
    { kind: "text", title: "Timeframe", paragraphs: [scores.timeframe] },
    {
      kind: "bullets",
      title: "Strengths",
      items: analysis.strengths.map(clean),
    },
    { kind: "bullets", title: "Gaps", items: analysis.gaps.map(clean) },
    {
      kind: "text",
      title: "Your plan",
      paragraphs: paragraphs(analysis.personalizedPlan),
    },
    {
      kind: "timeline",
      title: "Your roadmap",
      steps: analysis.weeklyRoadmap.map((w) => ({
        label: `Week ${w.week}`,
        items: w.tasks.map(clean),
      })),
    },
    {
      kind: "resources",
      title: "Resources",
      items: analysis.resources.map((r) => ({
        title: clean(r.title),
        description: clean(r.description),
        url: r.link,
      })),
    },
    {
      kind: "text",
      title: "Risks",
      paragraphs: paragraphs(analysis.riskAssessment),
    },
  ];
};
