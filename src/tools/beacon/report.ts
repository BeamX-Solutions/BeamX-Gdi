/**
 * Beacon's report (spec 0010): one AI phase, "advisory". Claude rewrites only the text
 * of the rule based advisory; `checkAdvisory` holds its structure, links and numbers
 * fixed (AC-8). Instructions ported from the standalone's polish prompt.
 */
import { z } from "zod";
import type { Answers, TypedPhase } from "../_contract";
import { DATA_BLOCK_RULE, fenceData, formatAnswer } from "../_kit/prompt";
import {
  advisorySchema,
  type Advisory,
  type Part,
  type Section,
} from "./advisory";
import { bandLabels } from "./categories";
import { beaconQuestions } from "./questions";
import type { BeaconScores } from "./scoring";

export const beaconContentSchema = z.object({ advisory: advisorySchema });

export type BeaconContent = z.infer<typeof beaconContentSchema>;

/** At most this many issue lines go back to the model. */
export const MAX_ISSUES = 20;

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const NUMBER = /\d+(?:\.\d+)?/g;
const URL_PATTERN = /(https?:\/\/|www\.)\S+/gi;

/** Every text field of a part, in order. */
const partTexts = (part: Part): readonly string[] => {
  switch (part.kind) {
    case "paragraph":
      return [part.lead ?? "", part.text];
    case "note":
    case "label":
    case "subheading":
      return [part.text];
    case "bullets":
    case "numbered":
      return part.items.flatMap((item) => [item.lead ?? "", item.text]);
    case "rule":
      return [];
    case "link":
      return [part.text, part.url];
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

const sectionTexts = (section: Section): readonly string[] => [
  section.heading,
  ...section.parts.flatMap(partTexts),
];

const numbersIn = (texts: readonly string[]): ReadonlySet<string> =>
  new Set(texts.flatMap((t) => t.match(NUMBER) ?? []));

/** Problems with one part against the rule's part at the same place. */
const partIssues = (rule: Part, out: Part): readonly string[] => {
  if (rule.kind !== out.kind)
    return [`should be a ${rule.kind}, not a ${out.kind}`];
  const issues: string[] = [];
  if ((rule.tight ?? false) !== (out.tight ?? false))
    issues.push("its spacing changed (tight)");
  switch (rule.kind) {
    case "paragraph":
      if (out.kind === "paragraph" && rule.lead !== out.lead)
        issues.push("its bold lead changed");
      break;
    case "label":
    case "subheading":
      if (out.kind === rule.kind && rule.text !== out.text)
        issues.push(`its ${rule.kind} text changed`);
      break;
    case "link":
      if (
        out.kind === "link" &&
        (rule.text !== out.text || rule.url !== out.url)
      )
        issues.push("the link changed");
      break;
    case "bullets":
    case "numbered":
      if (out.kind === rule.kind) {
        if (rule.items.length !== out.items.length)
          issues.push(
            `it should have ${rule.items.length} items, not ${out.items.length}`,
          );
        else
          rule.items.forEach((item, i) => {
            if (item.lead !== out.items[i]?.lead)
              issues.push(`item ${i + 1}'s bold lead changed`);
          });
      }
      break;
    case "note":
    case "rule":
      break;
    default: {
      const unreachable: never = rule;
      return unreachable;
    }
  }
  return issues;
};

const sectionIssues = (
  index: number,
  rule: Section,
  out: Section,
): readonly string[] => {
  const where = `Section ${index + 1} ("${rule.heading}")`;
  const structural: readonly string[] =
    rule.heading !== out.heading
      ? [`${where}: the heading changed`]
      : rule.parts.length !== out.parts.length
        ? [
            `${where}: it should have ${rule.parts.length} parts, not ${out.parts.length}`,
          ]
        : rule.parts.flatMap((part, j) => {
            const outPart = out.parts[j];
            return outPart
              ? partIssues(part, outPart).map(
                  (issue) => `${where}, part ${j + 1}: ${issue}`,
                )
              : [];
          });
  const kept = numbersIn(sectionTexts(out));
  const lost = [...numbersIn(sectionTexts(rule))].filter((n) => !kept.has(n));
  return [
    ...structural,
    ...lost.map(
      (n) =>
        `${where}: the number ${n} is missing; keep every number as digits`,
    ),
  ];
};

/**
 * The output must keep the rule advisory's structure, every heading, lead, label,
 * subheading, link and number, and add no URL the rule does not have (spec 0010,
 * AC-8). Pure. Returns at most `MAX_ISSUES` lines; empty accepts.
 */
export const checkAdvisory = (
  rule: Advisory,
  out: Advisory,
): readonly string[] => {
  const ruleText = rule.sections.flatMap(sectionTexts).join("\n");
  const urls = [
    ...new Set(
      out.sections
        .flatMap(sectionTexts)
        .flatMap((t) => t.match(URL_PATTERN) ?? []),
    ),
  ].filter((url) => !ruleText.includes(url));
  const issues = [
    ...(rule.sections.length !== out.sections.length
      ? [
          `The advisory should have ${rule.sections.length} sections, not ${out.sections.length}`,
        ]
      : rule.sections.flatMap((section, i) => {
          const outSection = out.sections[i];
          return outSection ? sectionIssues(i, section, outSection) : [];
        })),
    ...urls.map((url) => `Remove the web address ${url}; add no links`),
  ];
  return issues.slice(0, MAX_ISSUES);
};

// ---------------------------------------------------------------------------
// The phase
// ---------------------------------------------------------------------------

const labelOf = (answers: Answers, id: string): string => {
  const question = beaconQuestions.find((q) => q.id === id);
  const value = answers[id];
  return question && value !== undefined ? formatAnswer(question, value) : "";
};

const INSTRUCTIONS = [
  "You are a senior business advisor at BeamX Solutions: direct, warm, and sharp.",
  "You rewrite a structured business assessment advisory in a natural, engaging voice. The advisory is given as JSON sections; return the same JSON shape.",
  DATA_BLOCK_RULE,
  "Rules:",
  "- Rewrite only the text fields (paragraph text, note text, and list item text). Keep every heading, bold lead, label, subheading and link exactly as given.",
  "- Keep the same sections, the same parts in the same order, the same kinds, the same tight flags, and the same number of list items.",
  "- Keep every number as digits, with the same value (write 30 days, never a month; keep 100.0 as 100.0).",
  "- Add nothing and remove nothing: no new recommendations, facts or links.",
  "- Write in second person (you, your business). Be warm but honest: do not sugarcoat real problems, and do not catastrophize.",
  "- When a first name is given, use it naturally once or twice per section, never in every sentence. When the first name is none, just use you.",
  "- Keep about the same length. Write like a trusted advisor talking to this person, not generic corporate language.",
].join("\n");

export const advisoryPhase: TypedPhase<BeaconScores, Advisory> = {
  key: "advisory",
  label: "Writing your advice",
  modelRole: "report",
  maxOutputTokens: 12_000,
  timeoutMs: 90_000,
  output: advisorySchema,
  buildPrompt: ({ answers, scores, client }) => ({
    instructions: INSTRUCTIONS,
    prompt: [
      "Rewrite this advisory for the business owner below. Every fact, number, score and recommendation stays exactly as it is; only the tone and phrasing change.",
      "",
      fenceData(
        [
          `Business name: ${labelOf(answers, "business_name")}`,
          `First name: ${client.firstName ?? "none"}`,
          `Stage: ${bandLabels[scores.band]}`,
          `Score: ${scores.total.toFixed(1)}/100`,
          `Industry: ${labelOf(answers, "industry")}`,
          `Years in business: ${labelOf(answers, "years_in_business")}`,
          `Primary challenge: ${labelOf(answers, "primary_pain_point")}`,
          "",
          "Advisory (JSON):",
          JSON.stringify(scores.advisory),
        ].join("\n"),
      ),
    ].join("\n"),
  }),
  check: (output, { scores }) => checkAdvisory(scores.advisory, output),
};
