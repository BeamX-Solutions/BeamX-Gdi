/**
 * The profile page's rows (spec 0012, AC-8), from the stored facts. Pure: the page
 * passes the facts, the tool names and the time zone. A fact whose value no longer fits
 * the catalog is left out, never shown.
 */
import {
  factEditors,
  factKeys,
  formatFact,
  parseFact,
  type AnswerValue,
  type FactKey,
  type QuestionView,
} from "@/tools/registry";

export type ProfileFactInput = {
  readonly key: string;
  readonly value: unknown;
  readonly sourceToolId: string | null;
  readonly updatedAt: string;
};

export type ProfileRow = {
  readonly key: FactKey;
  readonly label: string;
  /** The value in plain words. */
  readonly value: string;
  /** "From Beacon, 24 Nov" or "You edited this, 24 Nov". */
  readonly origin: string;
  /** The edit card and the answer it opens with (null when no option holds it). */
  readonly question: QuestionView;
  readonly initialValue: AnswerValue | null;
};

/** "24 Nov" in `timeZone`, or null when the text is not a date. */
export const shortDay = (iso: string, timeZone: string): string | null => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone,
      });
};

export const profileRows = (
  facts: readonly ProfileFactInput[],
  toolName: (toolId: string) => string | null,
  timeZone: string,
): readonly ProfileRow[] => {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  return factKeys.flatMap((key): ProfileRow[] => {
    const fact = byKey.get(key);
    if (fact === undefined || parseFact(key, fact.value) === null) return [];
    const day = shortDay(fact.updatedAt, timeZone);
    const tool =
      fact.sourceToolId === null ? null : toolName(fact.sourceToolId);
    const from = tool === null ? "You edited this" : `From ${tool}`;
    const editor = factEditors[key];
    return [
      {
        key,
        label: editor.question.prompt,
        value: formatFact(key, fact.value),
        origin: day === null ? from : `${from}, ${day}`,
        question: editor.question,
        initialValue: editor.fact.fromFact(fact.value),
      },
    ];
  });
};
