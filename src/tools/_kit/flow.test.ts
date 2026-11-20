import { describe, expect, it } from "vitest";
import { sampleTool } from "../test-tools/sample";
import {
  missingAnswers,
  nextQuestion,
  progress,
  questionProgress,
  visibleAnswers,
  visibleQuestions,
} from "./flow";

const ids = (qs: readonly { id: string }[]) => qs.map((q) => q.id);

describe("visibleQuestions (AC-4)", () => {
  it("hides questions whose when fails, keeping list order", () => {
    expect(ids(visibleQuestions(sampleTool, {}))).toEqual([
      "stage",
      "channels",
      "confidence",
      "team_size",
    ]);
    expect(ids(visibleQuestions(sampleTool, { stage: "selling" }))).toEqual([
      "stage",
      "monthly_sales",
      "channels",
      "confidence",
      "team_size",
    ]);
    expect(
      ids(
        visibleQuestions(sampleTool, { stage: "selling", monthly_sales: 10 }),
      ),
    ).toEqual([
      "stage",
      "monthly_sales",
      "best_month",
      "channels",
      "confidence",
      "team_size",
    ]);
  });

  it("never lets an answer on a hidden question unlock another", () => {
    // monthly_sales is left over from when stage was "selling".
    const answers = { stage: "idea", monthly_sales: 10 };
    expect(ids(visibleQuestions(sampleTool, answers))).not.toContain(
      "best_month",
    );
    expect(visibleAnswers(sampleTool, answers)).toEqual({ stage: "idea" });
  });
});

describe("nextQuestion", () => {
  it("returns the first visible unanswered question", () => {
    expect(nextQuestion(sampleTool, {})?.id).toBe("stage");
    expect(nextQuestion(sampleTool, { stage: "selling" })?.id).toBe(
      "monthly_sales",
    );
    expect(nextQuestion(sampleTool, { stage: "idea" })?.id).toBe("channels");
  });

  it("returns null when every visible question is answered", () => {
    expect(
      nextQuestion(sampleTool, {
        stage: "idea",
        channels: ["market"],
        confidence: 3,
        team_size: 1,
      }),
    ).toBeNull();
  });
});

describe("progress and missingAnswers", () => {
  it("count visible questions only", () => {
    expect(progress(sampleTool, { stage: "idea", monthly_sales: 10 })).toEqual({
      answered: 1,
      total: 4,
    });
    expect(progress(sampleTool, { stage: "selling" })).toEqual({
      answered: 1,
      total: 5,
    });
    expect(
      missingAnswers(sampleTool, { stage: "idea", confidence: 2 }),
    ).toEqual(["channels", "team_size"]);
  });
});

describe("questionProgress (spec 0006)", () => {
  it("counts the question among the visible ones, from 1", () => {
    expect(questionProgress(sampleTool, {}, "stage")).toEqual({
      question: { index: 1, total: 4 },
    });
    expect(
      questionProgress(sampleTool, { stage: "selling" }, "channels"),
    ).toEqual({ question: { index: 3, total: 5 } });
  });

  it("returns null for a hidden or unknown question", () => {
    expect(questionProgress(sampleTool, {}, "monthly_sales")).toBeNull();
    expect(questionProgress(sampleTool, {}, "nope")).toBeNull();
  });

  it("counts areas in order of first appearance, and the question within its area", () => {
    const tool = {
      questions: [
        { ...sampleTool.questions[0]!, id: "a1", area: "Business" },
        { ...sampleTool.questions[0]!, id: "a2", area: "Business" },
        { ...sampleTool.questions[0]!, id: "b1", area: "Marketing" },
        { ...sampleTool.questions[0]!, id: "b2", area: "Marketing" },
        { ...sampleTool.questions[0]!, id: "b3", area: "Marketing" },
      ],
    };
    expect(questionProgress(tool, {}, "b2")).toEqual({
      area: { index: 2, total: 2, name: "Marketing" },
      question: { index: 2, total: 3 },
    });
  });
});
