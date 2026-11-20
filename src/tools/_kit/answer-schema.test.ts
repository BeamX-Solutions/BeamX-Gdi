import { describe, expect, it } from "vitest";
import type { ToolQuestion } from "../_contract";
import { sampleTool } from "../test-tools/sample";
import { parseAnswer, parseQuestionAnswer } from "./answer-schema";

const reasonOf = (questionId: string, value: unknown): string => {
  const result = parseAnswer(sampleTool, questionId, value);
  if (result.ok) throw new Error(`expected ${questionId} to reject`);
  if (result.error.code !== "invalid_answer") throw new Error("wrong code");
  return result.error.reason;
};

describe("parseAnswer (AC-3)", () => {
  it("returns unknown_question for an id the tool does not have", () => {
    expect(parseAnswer(sampleTool, "nope", "x")).toEqual({
      ok: false,
      error: { code: "unknown_question", questionId: "nope" },
    });
  });

  describe("single", () => {
    it("accepts one of the option values", () => {
      expect(parseAnswer(sampleTool, "stage", "idea")).toEqual({
        ok: true,
        value: "idea",
      });
    });
    it.each([["other"], [""], [1], [["idea"]], [null]])(
      "rejects %j",
      (value) => {
        expect(parseAnswer(sampleTool, "stage", value)).toMatchObject({
          ok: false,
          error: { code: "invalid_answer", questionId: "stage" },
        });
      },
    );
  });

  describe("multi", () => {
    it("accepts min to max distinct option values", () => {
      expect(parseAnswer(sampleTool, "channels", ["whatsapp"]).ok).toBe(true);
      expect(
        parseAnswer(sampleTool, "channels", ["whatsapp", "market"]).ok,
      ).toBe(true);
    });
    it("rejects too few, too many, duplicates and unknown values", () => {
      expect(reasonOf("channels", [])).toBe("Pick 1 to 2.");
      expect(reasonOf("channels", ["whatsapp", "market", "instagram"])).toBe(
        "Pick 1 to 2.",
      );
      expect(reasonOf("channels", ["market", "market"])).toBe(
        "Pick each option once.",
      );
      expect(reasonOf("channels", ["tiktok"])).toBe("Pick one of the options.");
      expect(reasonOf("channels", "whatsapp")).toBeTruthy();
    });
  });

  describe("scale", () => {
    it("accepts integers from min to max", () => {
      expect(parseAnswer(sampleTool, "confidence", 1).ok).toBe(true);
      expect(parseAnswer(sampleTool, "confidence", 5).ok).toBe(true);
    });
    it.each([[0], [6], [2.5], ["3"]])("rejects %j", (value) => {
      expect(parseAnswer(sampleTool, "confidence", value).ok).toBe(false);
    });
  });

  describe("text input", () => {
    it("trims and accepts a string within maxLength", () => {
      expect(parseAnswer(sampleTool, "best_month", "  December  ")).toEqual({
        ok: true,
        value: "December",
      });
    });
    it("rejects empty, too long and non strings", () => {
      expect(reasonOf("best_month", "   ")).toBe("Enter an answer.");
      expect(reasonOf("best_month", "x".repeat(41))).toBe(
        "Keep it to 40 characters or fewer.",
      );
      expect(reasonOf("best_month", 12)).toBeTruthy();
    });
    it("uses the default limit of 200 when the question sets none", () => {
      const q: ToolQuestion = {
        kind: "text",
        id: "t",
        prompt: "?",
        input: "text",
      };
      expect(parseQuestionAnswer(q, "x".repeat(200)).ok).toBe(true);
      expect(parseQuestionAnswer(q, "x".repeat(201)).ok).toBe(false);
    });
  });

  describe("number and money inputs", () => {
    it("accepts a finite number within minValue and maxValue", () => {
      expect(parseAnswer(sampleTool, "team_size", 0).ok).toBe(true);
      expect(parseAnswer(sampleTool, "team_size", 2.5).ok).toBe(true);
      expect(parseAnswer(sampleTool, "monthly_sales", 250_000).ok).toBe(true);
    });
    it("rejects out of range, non finite, strings, and fractional money", () => {
      expect(reasonOf("team_size", -1)).toBe("Enter 0 or more.");
      expect(reasonOf("team_size", 501)).toBe("Enter 500 or less.");
      expect(parseAnswer(sampleTool, "team_size", Number.NaN).ok).toBe(false);
      expect(parseAnswer(sampleTool, "team_size", Infinity).ok).toBe(false);
      expect(parseAnswer(sampleTool, "team_size", "12").ok).toBe(false);
      expect(reasonOf("monthly_sales", 10.5)).toBe(
        "Enter a whole number of naira.",
      );
    });
  });

  it("applies the question's refine after the card rules", () => {
    expect(reasonOf("team_size", 13)).toBe("We do not take 13.");
    expect(parseAnswer(sampleTool, "team_size", 12).ok).toBe(true);
  });
});
