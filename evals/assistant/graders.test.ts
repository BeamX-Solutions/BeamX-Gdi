import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evalCases } from "./cases";
import {
  gradeAmbiguous,
  gradeControl,
  gradeExtraction,
  gradeGrounding,
  gradeOffTopic,
  gradeOnTopic,
  gradePidgin,
  gradeRoute,
  gradeTypedAnswer,
  summarize,
  type CaseResult,
  type JudgeVerdict,
  type TurnObservation,
} from "./graders";
import { resolveRefs, RUN_IDS } from "./world";

// Spec 0006, AC-4, AC-10, AC-11, AC-12, AC-15: the eval graders, with no model.

const obs = (over: Partial<TurnObservation> = {}): TurnObservation => ({
  toolCalls: [],
  approvalRequested: false,
  text: "",
  failed: false,
  ...over,
});

const startRun = (toolId: string) => ({
  name: "startRun",
  input: { toolId, shownPrice: 30 },
});

const verdict = (over: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  declined: false,
  polite: true,
  pointsBack: true,
  plainVoice: true,
  pidginTouch: false,
  reason: "",
  ...over,
});

describe("cases.json", () => {
  it("parses against the case schema", () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("./cases.json", import.meta.url), "utf8"),
    );
    const cases = evalCases.parse(raw);
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });
});

describe("routing (AC-4)", () => {
  it("passes a startRun for the tool behind an approval card", () => {
    const g = gradeRoute(
      obs({ toolCalls: [startRun("stellar")], approvalRequested: true }),
      "stellar",
    );
    expect(g).toEqual({ pass: true, reasons: [] });
  });

  it("fails a wrong tool, or a proposal with no card", () => {
    expect(
      gradeRoute(
        obs({ toolCalls: [startRun("beacon")], approvalRequested: true }),
        "stellar",
      ).pass,
    ).toBe(false);
    expect(
      gradeRoute(obs({ toolCalls: [startRun("stellar")] }), "stellar").pass,
    ).toBe(false);
  });
});

describe("ambiguity (AC-4)", () => {
  it("passes exactly one clarifying question", () => {
    expect(
      gradeAmbiguous(obs({ text: "Is it a new idea or a running shop?" }), [
        "stellar",
      ]).pass,
    ).toBe(true);
  });

  it("passes a proposal of an allowed tool", () => {
    expect(
      gradeAmbiguous(
        obs({ toolCalls: [startRun("stellar")], approvalRequested: true }),
        ["stellar"],
      ).pass,
    ).toBe(true);
  });

  it("fails two questions, no question, or a tool outside the allowed list", () => {
    expect(
      gradeAmbiguous(obs({ text: "New idea? Or running shop?" }), []).pass,
    ).toBe(false);
    expect(gradeAmbiguous(obs({ text: "Tell me more." }), []).pass).toBe(false);
    expect(
      gradeAmbiguous(
        obs({ toolCalls: [startRun("stellar")], approvalRequested: true }),
        ["beacon"],
      ).pass,
    ).toBe(false);
  });
});

describe("topic (AC-10)", () => {
  it("passes a polite decline with a pointer back and no tool call", () => {
    expect(
      gradeOffTopic(obs({ text: "Sorry..." }), verdict({ declined: true }))
        .pass,
    ).toBe(true);
  });

  it("fails an off topic case that was answered, called a tool, or had no verdict", () => {
    expect(gradeOffTopic(obs(), verdict()).pass).toBe(false);
    expect(
      gradeOffTopic(
        obs({ toolCalls: [startRun("stellar")] }),
        verdict({ declined: true }),
      ).pass,
    ).toBe(false);
    expect(gradeOffTopic(obs(), null).pass).toBe(false);
  });

  it("fails an on topic case only when it was declined", () => {
    expect(gradeOnTopic(obs(), verdict()).pass).toBe(true);
    expect(gradeOnTopic(obs(), verdict({ declined: true })).pass).toBe(false);
  });
});

describe("voice (AC-11)", () => {
  it("needs plain English with a Pidgin touch, short, and no headings", () => {
    const good = verdict({ pidginTouch: true });
    expect(
      gradePidgin(obs({ text: "No wahala, we fit check am." }), good).pass,
    ).toBe(true);
    expect(gradePidgin(obs({ text: "## Plan\nok" }), good).pass).toBe(false);
    expect(gradePidgin(obs({ text: "word ".repeat(101) }), good).pass).toBe(
      false,
    );
    expect(gradePidgin(obs({ text: "ok" }), verdict()).pass).toBe(false);
  });
});

describe("typed answers (AC-8)", () => {
  const save = (questionId: string, value: unknown) => ({
    name: "saveAnswer",
    input: { runId: RUN_IDS.active, questionId, value },
  });

  it("passes an accepted value, and any text when no values are listed", () => {
    expect(
      gradeTypedAnswer(obs({ toolCalls: [save("investment", "100-500")] }), {
        questionId: "investment",
        values: ["100-500"],
      }).pass,
    ).toBe(true);
    expect(
      gradeTypedAnswer(obs({ toolCalls: [save("value_creation", "I help")] }), {
        questionId: "value_creation",
      }).pass,
    ).toBe(true);
  });

  it("compares multiple choice answers in any order", () => {
    expect(
      gradeTypedAnswer(obs({ toolCalls: [save("ch", ["b", "a"])] }), {
        questionId: "ch",
        values: [["a", "b"]],
      }).pass,
    ).toBe(true);
  });

  it("fails a wrong value, a missing save, or a save for a side question", () => {
    expect(
      gradeTypedAnswer(obs({ toolCalls: [save("investment", "under-100")] }), {
        questionId: "investment",
        values: ["100-500"],
      }).pass,
    ).toBe(false);
    expect(
      gradeTypedAnswer(obs(), { questionId: "investment", values: ["x"] }).pass,
    ).toBe(false);
    expect(
      gradeTypedAnswer(obs({ toolCalls: [save("speed", "months")] }), null)
        .pass,
    ).toBe(false);
    expect(
      gradeTypedAnswer(obs({ text: "About ten minutes." }), null).pass,
    ).toBe(true);
  });
});

describe("controls (AC-9)", () => {
  it("resolves run refs and matches the input fields", () => {
    const input = resolveRefs({ runId: "@paused", other: "plain" });
    expect(input).toEqual({ runId: RUN_IDS.paused, other: "plain" });
    const call = { name: "resumeRun", input: { runId: RUN_IDS.paused } };
    expect(
      gradeControl(obs({ toolCalls: [call] }), "resumeRun", {
        runId: RUN_IDS.paused,
      }).pass,
    ).toBe(true);
    expect(
      gradeControl(obs({ toolCalls: [call] }), "resumeRun", {
        runId: RUN_IDS.active,
      }).pass,
    ).toBe(false);
    expect(gradeControl(obs(), "stopRun", {}).pass).toBe(false);
  });
});

describe("grounding (AC-12)", () => {
  it("fails a reply that states a number", () => {
    expect(
      gradeGrounding(obs({ text: "Stellar costs 30 credits." })).pass,
    ).toBe(false);
    expect(
      gradeGrounding(obs({ text: "The card shows the price." })).pass,
    ).toBe(true);
  });
});

describe("extraction (AC-5)", () => {
  it("needs exactly the expected answers", () => {
    const expect_ = { investment: "under-100" };
    expect(
      gradeExtraction(
        [{ questionId: "investment", value: "under-100" }],
        expect_,
      ).pass,
    ).toBe(true);
    expect(gradeExtraction([], expect_).pass).toBe(false);
    expect(
      gradeExtraction(
        [
          { questionId: "investment", value: "under-100" },
          { questionId: "speed", value: "months" },
        ],
        expect_,
      ).reasons,
    ).toEqual(["invented: speed"]);
    expect(gradeExtraction([], {}).pass).toBe(true);
  });
});

describe("summary bars (AC-4, AC-10)", () => {
  const result = (over: Partial<CaseResult>): CaseResult => ({
    id: "x",
    kind: "route",
    skipped: false,
    pass: true,
    reasons: [],
    ...over,
  });

  it("meets the bars at 9 of 10 routing, all off topic declined, no on topic declines", () => {
    const results = [
      ...Array.from({ length: 9 }, () => result({})),
      result({ kind: "ambiguous", pass: false }),
      result({ kind: "off_topic", judge: verdict({ declined: true }) }),
      result({ kind: "on_topic", judge: verdict() }),
      result({ kind: "route", skipped: true, pass: false }),
    ];
    const s = summarize(results);
    expect(s.routing).toMatchObject({ passed: 9, total: 10, ok: true });
    expect(s.offTopicDeclined.ok).toBe(true);
    expect(s.onTopicDeclines).toMatchObject({ declined: 0, ok: true });
    expect(s.skipped).toBe(1);
    expect(s.ok).toBe(true);
  });

  it("misses when one on topic case is declined or routing drops below 90%", () => {
    expect(
      summarize([
        result({ kind: "on_topic", judge: verdict({ declined: true }) }),
      ]).ok,
    ).toBe(false);
    expect(
      summarize([
        ...Array.from({ length: 8 }, () => result({})),
        result({ pass: false }),
        result({ pass: false }),
      ]).ok,
    ).toBe(false);
  });

  it("counts an on topic case with no verdict as declined (fails safe)", () => {
    expect(
      summarize([result({ kind: "on_topic", judge: null })]).onTopicDeclines
        .declined,
    ).toBe(1);
  });
});
