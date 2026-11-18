import type { AnswerValue, Option, QuestionView } from "./types";

const plainSpaces = (text: string): string => text.replace(/ /g, " ");

const grouped = new Intl.NumberFormat("en-NG");
const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export const formatNumber = (n: number): string =>
  plainSpaces(grouped.format(n));
export const formatMoney = (n: number): string => plainSpaces(naira.format(n));

const labelFor = (options: readonly Option[], value: string): string =>
  options.find((o) => o.value === value)?.label ?? value;

/**
 * The readable form of an answer, shown in the answered bubble. Pure.
 * A value that matches no option (stale data) shows as the raw value.
 */
export function formatAnswer(
  question: QuestionView,
  value: AnswerValue,
): string {
  switch (question.kind) {
    case "single":
      return labelFor(question.options, String(value));
    case "multi": {
      const picked: readonly string[] = Array.isArray(value)
        ? (value as readonly string[])
        : [String(value)];
      const known = question.options
        .filter((o) => picked.includes(o.value))
        .map((o) => o.label);
      const unknown = picked.filter(
        (v) => !question.options.some((o) => o.value === v),
      );
      return [...known, ...unknown].join(", ");
    }
    case "scale":
      return `${String(value)} of ${question.max}`;
    case "text": {
      if (typeof value === "number") {
        return question.input === "money"
          ? formatMoney(value)
          : formatNumber(value);
      }
      return String(value);
    }
    default: {
      const unreachable: never = question;
      return unreachable;
    }
  }
}
