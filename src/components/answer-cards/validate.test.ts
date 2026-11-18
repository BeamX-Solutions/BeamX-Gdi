import { describe, expect, it } from "vitest";
import { multiCanConfirm, multiHint, validateTextAnswer } from "./validate";
import type { TextQuestion } from "./types";

const q = (
  over: Partial<TextQuestion> & Pick<TextQuestion, "input">,
): TextQuestion => ({
  kind: "text",
  id: "t",
  prompt: "p",
  ...over,
});

describe("validateTextAnswer (AC-8)", () => {
  it("text: trims and accepts", () => {
    expect(validateTextAnswer(q({ input: "text" }), "  hello ")).toEqual({
      ok: true,
      value: "hello",
    });
  });

  it("text: empty is an error", () => {
    expect(validateTextAnswer(q({ input: "text" }), "   ").ok).toBe(false);
  });

  it("text: over the default 200 limit is an error; maxLength overrides it", () => {
    const long = "a".repeat(201);
    expect(validateTextAnswer(q({ input: "text" }), long).ok).toBe(false);
    expect(
      validateTextAnswer(q({ input: "text", maxLength: 300 }), long).ok,
    ).toBe(true);
  });

  it("number: accepts grouping commas and decimals", () => {
    expect(validateTextAnswer(q({ input: "number" }), "1,250.5")).toEqual({
      ok: true,
      value: 1250.5,
    });
  });

  it("number: rejects words and enforces the range", () => {
    const question = q({ input: "number", minValue: 1, maxValue: 10 });
    expect(validateTextAnswer(question, "abc").ok).toBe(false);
    expect(validateTextAnswer(question, "0").ok).toBe(false);
    expect(validateTextAnswer(question, "11").ok).toBe(false);
    expect(validateTextAnswer(question, "10").ok).toBe(true);
  });

  it("money: whole naira only, strips the ₦ sign and commas", () => {
    expect(validateTextAnswer(q({ input: "money" }), "₦250,000")).toEqual({
      ok: true,
      value: 250000,
    });
    expect(validateTextAnswer(q({ input: "money" }), "250.50").ok).toBe(false);
  });

  it("money: range errors name the limit", () => {
    const r = validateTextAnswer(q({ input: "money", minValue: 1000 }), "500");
    expect(r).toEqual({ ok: false, error: "Enter 1000 or more." });
  });
});

describe("multi choice rules (AC-8)", () => {
  it("hint reads 'Pick 2 to 4', or 'Pick up to 4' when min is 0", () => {
    expect(multiHint({ min: 2, max: 4 })).toBe("Pick 2 to 4");
    expect(multiHint({ min: 0, max: 4 })).toBe("Pick up to 4");
  });

  it("confirm needs at least min and at most max picks", () => {
    expect(multiCanConfirm({ min: 2, max: 4 }, 1)).toBe(false);
    expect(multiCanConfirm({ min: 2, max: 4 }, 2)).toBe(true);
    expect(multiCanConfirm({ min: 2, max: 4 }, 4)).toBe(true);
    expect(multiCanConfirm({ min: 2, max: 4 }, 5)).toBe(false);
  });
});
