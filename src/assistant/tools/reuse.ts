/**
 * Answer reuse across tools (spec 0011, AC-3 to AC-6). Pure helpers: the day shown on
 * the approval card, and which copied answers the new tool accepts.
 */
import type { CopiedAnswer } from "@/db/queries/runs";
import { parseAnswer, type ToolModule } from "@/tools/registry";

/** What the approval card says about reused answers; written by the server. */
export type ReuseNote = {
  readonly runId: string;
  /** The source run's tool name ("Beacon"). */
  readonly toolName: string;
  /** The day of its last answer ("24 Nov"). */
  readonly answeredOn: string;
};

/**
 * "24 Nov" from a stored Postgres timestamp ("2026-11-24 10:00:00.123456+00"), in
 * `timeZone`. Null when the text does not parse.
 */
export const reuseDay = (stored: string, timeZone: string): string | null => {
  const iso = stored
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone,
      });
};

/**
 * The answers the new tool accepts, each parsed by its own question (AC-6). An unknown
 * question or a value that no longer fits is left out, so its card is asked instead.
 */
export const acceptedAnswers = (
  tool: Pick<ToolModule, "questions">,
  answers: readonly CopiedAnswer[],
): readonly CopiedAnswer[] =>
  answers.flatMap((a) => {
    const parsed = parseAnswer(tool, a.questionId, a.value);
    return parsed.ok
      ? [{ questionId: a.questionId, value: parsed.value, source: a.source }]
      : [];
  });
