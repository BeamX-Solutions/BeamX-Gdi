/**
 * A ready report as plain text for the assistant (spec 0014, AC-1, AC-3): every block of
 * the tool's own view, in order, with no markup. Pure.
 */
import type { ReportBlock, RichLine, RichPart } from "@/tools/registry";

/** The most report text one `readReport` returns (AC-3). */
export const REPORT_TEXT_MAX = 20_000;

export const TRUNCATED_NOTE = "(The rest of this report is not shown.)";

const line = (l: RichLine): string =>
  l.lead === undefined ? l.text : `${l.lead} ${l.text}`;

const partLines = (part: RichPart): readonly string[] => {
  switch (part.kind) {
    case "paragraph":
      return [
        part.lead === undefined ? part.text : `${part.lead} ${part.text}`,
      ];
    case "note":
    case "label":
      return [part.text];
    case "subheading":
      return [`${part.text}:`];
    case "bullets":
      return part.items.map((i) => `- ${line(i)}`);
    case "numbered":
      return part.items.map((i, n) => `${n + 1}. ${line(i)}`);
    case "rule":
      return [];
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
};

/** One block as text lines, its title first. */
export const blockText = (block: ReportBlock): readonly string[] => {
  switch (block.kind) {
    case "score_header":
      return [
        `${block.title}: ${block.score} of ${block.max} (${block.verdict}). ${block.summary}`,
      ];
    case "category_bars":
      return [
        `${block.title}:`,
        ...block.items.map(
          (i) =>
            `- ${i.label}: ${i.score} of ${i.max}${i.verdict ? ` (${i.verdict})` : ""}`,
        ),
      ];
    case "advice_list":
      return [
        `${block.title}:`,
        ...block.items.map(
          (i) =>
            `- [${i.priority}] ${i.title}${i.detail ? ` (${i.detail})` : ""}`,
        ),
      ];
    case "text":
      return [`${block.title}:`, ...block.paragraphs];
    case "bullets":
      return [`${block.title}:`, ...block.items.map((i) => `- ${i}`)];
    case "timeline":
      return [
        `${block.title}:`,
        ...block.steps.flatMap((s) => [
          `${s.label}:`,
          ...s.items.map((i) => `- ${i}`),
        ]),
      ];
    case "rich_section":
      return [`${block.title}:`, ...block.parts.flatMap(partLines)];
    case "resources":
      return [
        `${block.title}:`,
        ...block.items.map(
          (i) => `- ${i.title}: ${i.description}${i.url ? ` (${i.url})` : ""}`,
        ),
      ];
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
};

/**
 * The whole report as text, blocks separated by a blank line, cut at a block boundary
 * so it stays under `max` characters (AC-3).
 */
export const reportText = (
  blocks: readonly ReportBlock[],
  max: number = REPORT_TEXT_MAX,
): { readonly text: string; readonly truncated: boolean } => {
  const parts: string[] = [];
  let length = 0;
  for (const block of blocks) {
    const text = blockText(block).join("\n");
    const added = (parts.length === 0 ? 0 : 2) + text.length;
    if (length + added > max) {
      return {
        text: [...parts, TRUNCATED_NOTE].join("\n\n"),
        truncated: true,
      };
    }
    parts.push(text);
    length += added;
  }
  return { text: parts.join("\n\n"), truncated: false };
};
