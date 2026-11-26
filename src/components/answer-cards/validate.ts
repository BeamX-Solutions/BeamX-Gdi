import { err, ok, type Result } from "@/lib/result";
import { DEFAULT_TEXT_MAX } from "@/tools/_contract";
import type { MultiQuestion, TextQuestion } from "./types";

export { DEFAULT_TEXT_MAX };

/** Turns what was typed into a number: drops grouping commas, spaces, and the naira sign. */
const toNumber = (raw: string): number =>
  raw.trim() === "" ? Number.NaN : Number(raw.replace(/[,\s₦]/g, ""));

/**
 * Validates a text card on submit (AC-8). Returns the value to submit or a short,
 * plain message to show under the field.
 */
export function validateTextAnswer(
  question: TextQuestion,
  raw: string,
): Result<string | number, string> {
  const text = raw.trim();
  if (text === "")
    return question.optional ? ok("") : err("Enter an answer to continue.");

  if (question.input === "text") {
    const max = question.maxLength ?? DEFAULT_TEXT_MAX;
    return text.length > max
      ? err(`Keep it to ${max} characters or fewer.`)
      : ok(text);
  }

  const n = toNumber(text);
  if (!Number.isFinite(n)) return err("Enter a number, like 1250.");
  if (question.input === "money" && !Number.isInteger(n)) {
    return err("Enter a whole number of naira, like 250000.");
  }
  if (question.minValue !== undefined && n < question.minValue) {
    return err(`Enter ${question.minValue} or more.`);
  }
  if (question.maxValue !== undefined && n > question.maxValue) {
    return err(`Enter ${question.maxValue} or less.`);
  }
  return ok(n);
}

/** The hint under a multi choice card: "Pick 2 to 4", or "Pick up to 4" when `min` is 0. */
export const multiHint = (
  question: Pick<MultiQuestion, "min" | "max">,
): string =>
  question.min === 0
    ? `Pick up to ${question.max}`
    : `Pick ${question.min} to ${question.max}`;

/** A multi choice can be confirmed once the number picked is within `min..max`. */
export const multiCanConfirm = (
  question: Pick<MultiQuestion, "min" | "max">,
  pickedCount: number,
): boolean => pickedCount >= question.min && pickedCount <= question.max;
