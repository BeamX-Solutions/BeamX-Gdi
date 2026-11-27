/**
 * Spec 0013: Luna's questions, profile links, completeness, phases, checks and view.
 * The plan slices come from the standalone's example plan (fixtures/parity/luna).
 */
import { describe, expect, it } from "vitest";
import examplePlan from "../../../fixtures/parity/luna/example-plan.json";
import questionsFixture from "../../../fixtures/parity/luna/questions.json";
import type { Answers, TypedPhaseContext } from "../_contract";
import { contractViolations, MAX_CALL_MS } from "../_kit/contract-check";
import { tools } from "../registry";
import { luna } from ".";
import { lunaQuestions } from "./facts";
import {
  assetsSchema,
  coreSchema,
  operationsSchema,
  overviewSchema,
} from "./plan";
import {
  answersBlock,
  type LunaScores,
  assetsPhase,
  corePhase,
  operationsPhase,
  overviewPhase,
} from "./report";
import { scoreLuna } from "./scoring";
import { lunaView, splitLead } from "./view";

const plan = examplePlan.plan;

const core = coreSchema.parse({
  customerJourney: plan.customerJourney,
  strategicInsights: plan.strategicInsights,
  risksPositioning: plan.risksPositioning,
});
const overview = overviewSchema.parse({
  executiveSummary: plan.executiveSummary,
  implementation: plan.implementation,
});
const operations = operationsSchema.parse({
  resources: plan.resources,
  kpis: plan.kpis,
});
const assets = assetsSchema.parse({
  templates: plan.templates,
  investmentRoi: plan.investmentRoi,
});

/** The first option, or a short text, for every question. */
const fullAnswers = (): Answers =>
  Object.fromEntries(
    lunaQuestions.map((q) => [
      q.id,
      q.kind === "single"
        ? (q.options[0]?.value ?? "")
        : q.kind === "multi"
          ? [q.options[0]?.value ?? ""]
          : q.id === "business-name"
            ? "Ada Foods"
            : "We cook healthy lunches for offices.",
    ]),
  );

const ctx = (answers: Answers): TypedPhaseContext<LunaScores> => ({
  answers,
  scores: { answered: 50 },
  earlier: { analysis: { a: 1 }, core, overview, operations },
  client: { firstName: null },
});

describe("the Luna module (AC-1, AC-10)", () => {
  it("is registered at 500 credits with five phases, one per call", () => {
    expect(luna).toMatchObject({
      id: "luna",
      version: "1",
      creditPrice: 500,
      phasesPerCall: 1,
    });
    expect(luna.phases.map((p) => p.key)).toEqual([
      "analysis",
      "core",
      "overview",
      "operations",
      "assets",
    ]);
    expect(luna.phases.every((p) => p.modelRole === "report_long")).toBe(true);
    expect(luna.phases.every((p) => 2 * p.timeoutMs <= MAX_CALL_MS)).toBe(true);
    expect(contractViolations(tools)).toEqual([]);
  });
});

describe("questions (AC-1, AC-2, AC-12)", () => {
  it("has the standalone's 50 questions in order", () => {
    const ids = [
      ...questionsFixture.businessContextQuestions,
      ...questionsFixture.questionnaireQuestions,
    ].map((q) => q.id);
    expect(lunaQuestions.map((q) => q.id)).toEqual(ids);
  });

  it("maps the form fields onto card kinds", () => {
    const kinds = Object.fromEntries(lunaQuestions.map((q) => [q.id, q]));
    expect(kinds["industry"]).toMatchObject({ kind: "single" });
    expect(kinds["target-demographics-age"]).toMatchObject({
      kind: "multi",
      min: 1,
      max: 2,
    });
    const site = kinds["business-website"];
    expect(site).toMatchObject({ kind: "text", optional: true });
    const long = lunaQuestions.filter(
      (q) => q.kind === "text" && q.multiline === true,
    );
    expect(long).toHaveLength(19);
    expect(
      lunaQuestions.filter((q) => q.kind === "text" && q.optional),
    ).toHaveLength(1);
  });

  it("groups questions into the business and 9 squares", () => {
    expect([...new Set(lunaQuestions.map((q) => q.area))]).toHaveLength(10);
  });

  it("links the seven business questions to profile facts", () => {
    expect(
      lunaQuestions.flatMap((q) => (q.fact ? [[q.id, q.fact.key]] : [])),
    ).toEqual([
      ["business-name", "business_name"],
      ["business-website", "business_website"],
      ["industry", "industry"],
      ["business-model", "business_model"],
      ["company-size", "team_size"],
      ["years-in-operation", "years_in_business"],
      ["geographic-scope", "geographic_scope"],
    ]);
  });
});

describe("completeness (AC-5)", () => {
  it("scores a complete set, with the website skipped", () => {
    const answers = { ...fullAnswers(), "business-website": "" };
    expect(scoreLuna(answers)).toEqual({ ok: true, value: { answered: 50 } });
  });

  it("names a missing answer", () => {
    const rest = Object.fromEntries(
      Object.entries(fullAnswers()).filter(([id]) => id !== "industry"),
    );
    expect(scoreLuna(rest)).toMatchObject({
      ok: false,
      error: { code: "incomplete", missing: ["industry"] },
    });
  });
});

describe("prompts (AC-5, AC-14)", () => {
  it("fences the answers by square, with the website as an address only", () => {
    const answers = { ...fullAnswers(), "business-website": "https://ada.ng" };
    const { instructions, prompt } = corePhase.buildPrompt(ctx(answers));
    expect(instructions).toContain("<client_data>");
    expect(instructions).toContain("Do NOT use em dashes");
    expect(prompt).toContain("Business name: Ada Foods");
    expect(prompt).toContain("https://ada.ng (an address only");
    expect(prompt).toContain("Square 1: Target Market & Customer Avatar");
    expect(prompt).toContain("Business analysis (JSON):");
    expect(answersBlock(answers)).toContain("Business context:");
  });

  it("passes every earlier phase to the last one", () => {
    const { prompt } = assetsPhase.buildPrompt(ctx(fullAnswers()));
    for (const label of [
      "Business analysis",
      "Core marketing plan",
      "Implementation roadmap",
      "Resources and KPIs",
    ])
      expect(prompt).toContain(`${label} (JSON):`);
  });
});

describe("checks (AC-5)", () => {
  const c = ctx(fullAnswers());

  it("accepts the standalone's example plan", () => {
    expect(corePhase.check?.(core, c)).toEqual([]);
    expect(overviewPhase.check?.(overview, c)).toEqual([]);
    expect(operationsPhase.check?.(operations, c)).toEqual([]);
    expect(assetsPhase.check?.(assets, c)).toEqual([]);
  });

  it("holds the counts", () => {
    const fewer = {
      ...overview,
      implementation: {
        ...overview.implementation,
        phases: overview.implementation.phases.slice(0, 2),
      },
    };
    expect(overviewPhase.check?.(fewer, c)).toEqual([
      "implementation.phases must have exactly 3 items, not 2",
    ]);
  });
});

describe("the plan view (AC-11)", () => {
  const blocks = lunaView({
    content: { analysis: {} as never, core, overview, operations, assets },
  });

  it("draws the sections in order, never the analysis", () => {
    expect(blocks.map((b) => b.title)).toEqual([
      "Executive Summary",
      "The Customer Journey",
      "Strategic Insights",
      "Risks and Positioning",
      "Implementation Roadmap",
      "Resources and Budget",
      "Key Performance Indicators",
      "Templates and Tools",
      "Investment and ROI",
    ]);
    expect(blocks[4]).toMatchObject({
      kind: "timeline",
      steps: [{}, {}, {}],
    });
  });

  it("never shows a raw bold marker or an em or en dash", () => {
    const text = JSON.stringify(blocks);
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/[–—]/);
  });

  it("turns a leading bold label into a lead", () => {
    expect(splitLead("**Trigger:** if leads drop")).toEqual({
      lead: "Trigger:",
      text: "if leads drop",
    });
    expect(splitLead("No label here")).toEqual({ text: "No label here" });
  });
});
