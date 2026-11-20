import { describe, expect, it } from "vitest";
import { formatAnswer } from "./format-answer";
import type { QuestionView } from "../_contract";

const options = [
  { value: "retail", label: "Retail, 6 to 20 staff" },
  { value: "food", label: "Food and drinks" },
  { value: "tech", label: "Technology" },
];

const single: QuestionView = {
  kind: "single",
  id: "q1",
  prompt: "Sector?",
  options,
};
const multi: QuestionView = {
  kind: "multi",
  id: "q2",
  prompt: "Channels?",
  options,
  min: 1,
  max: 3,
};
const scale: QuestionView = {
  kind: "scale",
  id: "q3",
  prompt: "How sure?",
  min: 1,
  max: 10,
  minLabel: "Not sure",
  maxLabel: "Certain",
};
const text = (input: "text" | "number" | "money"): QuestionView => ({
  kind: "text",
  id: "q4",
  prompt: "Tell us",
  input,
});

describe("formatAnswer (AC-9)", () => {
  it("single: the option label", () => {
    expect(formatAnswer(single, "retail")).toBe("Retail, 6 to 20 staff");
  });

  it("single: a value that matches no option shows raw", () => {
    expect(formatAnswer(single, "old-value")).toBe("old-value");
  });

  it("multi: labels in option order, joined with a comma", () => {
    expect(formatAnswer(multi, ["tech", "retail"])).toBe(
      "Retail, 6 to 20 staff, Technology",
    );
  });

  it("multi: unknown values are kept, after the known ones", () => {
    expect(formatAnswer(multi, ["gone", "food"])).toBe("Food and drinks, gone");
  });

  it("scale: '{n} of {max}'", () => {
    expect(formatAnswer(scale, 7)).toBe("7 of 10");
  });

  it("text: the string as typed", () => {
    expect(formatAnswer(text("text"), "A bakery in Yaba")).toBe(
      "A bakery in Yaba",
    );
  });

  it("number: grouped with en-NG", () => {
    expect(formatAnswer(text("number"), 1250)).toBe("1,250");
  });

  it("money: whole naira with the ₦ sign", () => {
    expect(formatAnswer(text("money"), 250000).replace(/ /g, " ")).toBe(
      "₦250,000",
    );
  });
});
