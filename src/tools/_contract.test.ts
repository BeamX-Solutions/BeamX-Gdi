import { describe, expect, it } from "vitest";
import { sampleTool } from "./test-tools/sample";

describe("defineTool", () => {
  it("keeps the module's metadata and phases", () => {
    expect(sampleTool).toMatchObject({
      id: "sample",
      version: "2",
      creditPrice: 5,
    });
    expect(sampleTool.phases.map((p) => p.key)).toEqual(["advice"]);
  });

  it("hands the typed toView parsed scores and content", () => {
    expect(
      sampleTool.toView({
        scores: { points: 3 },
        content: { advice: { text: "Sell more." } },
        answers: {},
      }),
    ).toEqual([
      { kind: "text", title: "Advice", paragraphs: ["Sell more."] },
      { kind: "bullets", title: "Points", items: ["3"] },
    ]);
  });

  it("hands the typed buildPrompt parsed scores", () => {
    const phase = sampleTool.phases[0];
    expect(
      phase?.buildPrompt({ answers: {}, scores: { points: 8 }, earlier: {} }),
    ).toEqual({ instructions: "Give advice.", prompt: "Points: 8" });
  });

  it("refuses data that skipped the schema (a caller bug, not a client error)", () => {
    expect(() =>
      sampleTool.toView({ scores: { points: "x" }, content: {}, answers: {} }),
    ).toThrow(/not parsed/);
  });
});
