import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, type TypedPhaseContext } from "./_contract";
import { sampleTool } from "./test-tools/sample";

const GUEST = { firstName: null };

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
      phase?.buildPrompt({
        answers: {},
        scores: { points: 8 },
        earlier: {},
        client: GUEST,
      }),
    ).toEqual({ instructions: "Give advice.", prompt: "Points: 8" });
  });

  it("refuses data that skipped the schema (a caller bug, not a client error)", () => {
    expect(() =>
      sampleTool.toView({ scores: { points: "x" }, content: {}, answers: {} }),
    ).toThrow(/not parsed/);
  });
});

describe("defineTool and a phase check (spec 0010)", () => {
  const output = z.object({ text: z.string() });
  const seen: {
    output: unknown;
    ctx: TypedPhaseContext<{ points: number }>;
  }[] = [];
  const checked = defineTool({
    id: "checked",
    version: "1",
    name: "Checked",
    summary: "A test tool.",
    whenToUse: "Never; tests only.",
    creditPrice: 1,
    questions: [],
    scoresSchema: z.object({ points: z.number() }),
    contentSchema: z.object({ advice: output }),
    score: () => ({ ok: true as const, value: { points: 1 } }),
    toView: () => [],
    phases: [
      {
        key: "advice",
        label: "Writing advice",
        modelRole: "report",
        maxOutputTokens: 100,
        timeoutMs: 1_000,
        output,
        buildPrompt: ({ client }) => ({
          instructions: "Give advice.",
          prompt: client.firstName ?? "none",
        }),
        check: (value: z.infer<typeof output>, ctx) => {
          seen.push({ output: value, ctx });
          return value.text.length > 3 ? [] : ["Too short."];
        },
      },
    ],
  });
  const phase = checked.phases[0];
  const ctx = {
    answers: {},
    scores: { points: 2 },
    earlier: {},
    client: { firstName: "Ada" },
  };

  it("passes the client to buildPrompt", () => {
    expect(phase?.buildPrompt(ctx).prompt).toBe("Ada");
    expect(phase?.buildPrompt({ ...ctx, client: GUEST }).prompt).toBe("none");
  });

  it("hands the typed check the parsed output and the typed context", () => {
    expect(phase?.check?.({ text: "long enough" }, ctx)).toEqual([]);
    expect(phase?.check?.({ text: "no" }, ctx)).toEqual(["Too short."]);
    expect(seen[0]).toEqual({ output: { text: "long enough" }, ctx });
  });

  it("refuses an output that skipped the phase schema", () => {
    expect(() => phase?.check?.({ text: 4 }, ctx)).toThrow(/not parsed/);
  });

  it("leaves check off a phase that has none", () => {
    expect(sampleTool.phases[0]?.check).toBeUndefined();
  });
});
