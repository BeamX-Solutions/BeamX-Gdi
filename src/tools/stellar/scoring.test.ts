import { describe, expect, it } from "vitest";
import type { Answers } from "../_contract";
import { parseAnswer } from "../_kit/answer-schema";
import { nextQuestion, progress, visibleQuestions } from "../_kit/flow";
import { stellarQuestions } from "./questions";
import { scoreStellar, stellarScoresSchema } from "./scoring";

const tool = { questions: stellarQuestions };

const base: Answers = {
  foundation: "all-three",
  value_creation:
    "I help market traders sell more by setting up WhatsApp orders",
  market_validation: "yes-confirmed",
  investment: "under-100",
  skills: "sometimes",
  speed: "yes-ready",
  passion_market_fit: "both",
  competitors: "Jumia (jumia.com.ng)",
  learning: "start-imperfect",
  commitment: "maybe",
};

const visibleIds = (answers: Answers) =>
  visibleQuestions(tool, answers).map((q) => q.id);

describe("Stellar questions (AC-4)", () => {
  it("has 14 questions with unique ids", () => {
    const ids = stellarQuestions.map((q) => q.id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(14);
  });

  it.each([
    ["investment", "500-1000", "investment_detail"],
    ["investment", "over-1000", "investment_detail"],
    ["skills", "no", "skills_detail"],
    ["speed", "almost", "speed_detail"],
    ["speed", "months", "speed_detail"],
    ["commitment", "yes", "commitment_detail"],
    ["commitment", "no", "commitment_detail"],
  ])("%s %s shows %s right after it", (parent, value, followUp) => {
    const ids = visibleIds({ ...base, [parent]: value });
    expect(ids.indexOf(followUp)).toBe(ids.indexOf(parent) + 1);
  });

  it.each([
    ["investment", "under-100", "investment_detail"],
    ["investment", "100-500", "investment_detail"],
    ["skills", "yes-regularly", "skills_detail"],
    ["skills", "sometimes", "skills_detail"],
    ["speed", "yes-ready", "speed_detail"],
    ["commitment", "maybe", "commitment_detail"],
  ])("%s %s hides %s", (parent, value, followUp) => {
    expect(visibleIds({ ...base, [parent]: value })).not.toContain(followUp);
  });

  it("counts only visible questions in progress", () => {
    expect(progress(tool, base)).toEqual({ answered: 10, total: 10 });
    expect(progress(tool, { ...base, speed: "almost" })).toEqual({
      answered: 10,
      total: 11,
    });
    expect(nextQuestion(tool, { ...base, speed: "almost" })?.id).toBe(
      "speed_detail",
    );
  });

  it("caps text answers at 500 characters", () => {
    expect(parseAnswer(tool, "speed_detail", "x".repeat(500)).ok).toBe(true);
    expect(parseAnswer(tool, "speed_detail", "x".repeat(501)).ok).toBe(false);
    expect(parseAnswer(tool, "competitors", "x".repeat(501)).ok).toBe(false);
  });
});

describe("scoreStellar (AC-6)", () => {
  it("returns incomplete with the missing visible ids", () => {
    expect(scoreStellar({ ...base, speed: "almost" })).toEqual({
      ok: false,
      error: { code: "incomplete", missing: ["speed_detail"] },
    });
    expect(scoreStellar({ foundation: "all-three" })).toMatchObject({
      ok: false,
      error: { code: "incomplete" },
    });
  });

  it("ignores an answer to a question that is now hidden", () => {
    const withLeftover = {
      ...base,
      speed: "yes-ready",
      speed_detail: "a leftover from when I picked almost",
    };
    expect(scoreStellar(withLeftover)).toEqual(scoreStellar(base));
  });

  it("uses the blocker text only for almost, cut to 80 characters", () => {
    const long = "y".repeat(100);
    const result = scoreStellar({
      ...base,
      speed: "almost",
      speed_detail: long,
    });
    if (!result.ok) throw new Error("expected scores");
    expect(result.value.actionItems).toContain(
      `Week 1: Resolve your specific blockers: "${"y".repeat(80)}"`,
    );
  });

  it("returns scores that match the scores schema", () => {
    const result = scoreStellar(base);
    if (!result.ok) throw new Error("expected scores");
    expect(stellarScoresSchema.safeParse(result.value).success).toBe(true);
    expect(result.value).toMatchObject({ score: 90, level: "green" });
  });
});
