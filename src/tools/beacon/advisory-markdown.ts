/**
 * Renders typed advisory sections back to the original markdown (spec 0010, "Advisory").
 * Used only by the parity test (AC-6), which compares the result byte for byte with
 * the standalone's `structured_advisory`. Nothing shown to clients goes through it.
 */
import type { Advisory, Line, Part, Section } from "./advisory";

const line = ({ lead, text }: Line): string =>
  lead === undefined ? text : `**${lead}** ${text}`;

const partText = (part: Part): string => {
  switch (part.kind) {
    case "paragraph":
      return part.lead === undefined
        ? part.text
        : part.text.length > 0
          ? `**${part.lead}** ${part.text}`
          : `**${part.lead}**`;
    case "note":
      return `*${part.text}*`;
    case "label":
      return `**${part.text}**`;
    case "subheading":
      return `### ${part.text}`;
    case "bullets":
      return part.items.map((item) => `- ${line(item)}`).join("\n");
    case "numbered":
      return part.items
        .map((item, index) => `${index + 1}. ${line(item)}`)
        .join("\n");
    case "rule":
      return "---";
    case "link":
      return `${part.text}: ${part.url}`;
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

const sectionText = (section: Section): string =>
  section.parts.reduce(
    (out, part) => `${out}${part.tight ? "\n" : "\n\n"}${partText(part)}`,
    `## ${section.heading}`,
  );

export const advisoryMarkdown = (advisory: Advisory): string =>
  advisory.sections.map(sectionText).join("\n\n---\n\n");
