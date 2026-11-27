/**
 * The contract test (spec 0005, AC-1): every registered module keeps the invariants, a
 * folder with two modules plugs in with one registry line each, and each kind of broken
 * module is caught.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ReportPhase, ToolModule } from "./_contract";
import { contractViolations, MAX_CALL_MS } from "./_kit/contract-check";
import { makeRegistry } from "./_kit/registry";
import { tools } from "./registry";
import { pairBasic, pairPro } from "./test-tools/pair";
import { sampleTool } from "./test-tools/sample";
import { threePhaseTool } from "./test-tools/three-phase";

const withPhases = (
  tool: ToolModule,
  phases: readonly ReportPhase[],
): ToolModule => ({ ...tool, phases });

const firstPhase = (tool: ToolModule): ReportPhase => {
  const phase = tool.phases[0];
  if (!phase) throw new Error(`${tool.id} has no phases`);
  return phase;
};

describe("the production registry", () => {
  it("has at least one tool", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it("keeps every contract invariant", () => {
    expect(contractViolations(tools)).toEqual([]);
  });
});

describe("plugging in tools", () => {
  const extended = [...tools, sampleTool, threePhaseTool, pairBasic, pairPro];

  it("accepts the test tools, including one folder with two modules", () => {
    expect(contractViolations(extended)).toEqual([]);
  });

  it("makes each added module reachable through the registry", () => {
    const registry = makeRegistry(extended);
    expect(registry.toolIds).toEqual(extended.map((t) => t.id));
    for (const id of ["pair-basic", "pair-pro"]) {
      const tool = registry.getTool(id);
      expect(tool.ok).toBe(true);
    }
  });

  it("scores both pair modules with the shared engine", () => {
    const answers = { sales: 4, cash: 2 };
    expect(pairBasic.score(answers)).toEqual(pairPro.score(answers));
  });

  it("reads an old version through its frozen reader", () => {
    const registry = makeRegistry(extended);
    expect(registry.getReader("sample", "1").ok).toBe(true);
    expect(registry.getReader("sample", "0")).toMatchObject({
      ok: false,
      error: { code: "unsupported_version" },
    });
  });
});

describe("broken modules", () => {
  it("catches a duplicate tool id", () => {
    expect(contractViolations([sampleTool, sampleTool])).toContain(
      'the tool id "sample" is registered more than once',
    );
  });

  it("catches a duplicate question id", () => {
    const first = sampleTool.questions[0];
    if (!first) throw new Error("sample has no questions");
    const broken = {
      ...sampleTool,
      questions: [...sampleTool.questions, first],
    };
    expect(contractViolations([broken])).toEqual([
      'tool "sample" has the question id "stage" more than once',
    ]);
  });

  it.each([0, -5, 2.5, Number.NaN])("catches creditPrice %s", (price) => {
    const broken = { ...sampleTool, creditPrice: price };
    expect(contractViolations([broken])).toEqual([
      `tool "sample" has creditPrice ${price}, not a positive integer`,
    ]);
  });

  it("catches duplicate phase keys", () => {
    const phase = firstPhase(threePhaseTool);
    const broken = withPhases(threePhaseTool, [
      ...threePhaseTool.phases,
      phase,
    ]);
    expect(contractViolations([broken])).toContain(
      'tool "three-phase" has the phase key "one" more than once',
    );
  });

  it("catches a phase key missing from contentSchema", () => {
    const broken = withPhases(sampleTool, [
      { ...firstPhase(sampleTool), key: "tips" },
    ]);
    expect(contractViolations([broken])).toEqual([
      'tool "sample" has phase keys [tips] that do not match the contentSchema keys [advice]',
    ]);
  });

  it("catches a contentSchema key no phase writes", () => {
    const broken = withPhases(
      threePhaseTool,
      threePhaseTool.phases.slice(0, 2),
    );
    expect(contractViolations([broken])).toHaveLength(1);
  });

  it("catches a contentSchema that is not an object", () => {
    const broken = { ...sampleTool, contentSchema: z.string() };
    expect(contractViolations([broken])).toEqual([
      'tool "sample" has a contentSchema that is not a z.object',
    ]);
  });

  it("catches a when predicate that throws on empty answers", () => {
    const broken = {
      ...sampleTool,
      questions: sampleTool.questions.map((q) =>
        q.id === "best_month"
          ? {
              ...q,
              when: (a: Readonly<Record<string, unknown>>) =>
                String(a.monthly_sales).length > 0 &&
                (a.monthly_sales as { readonly n: number }).n > 0,
            }
          : q,
      ),
    };
    expect(contractViolations([broken])).toEqual([
      'tool "sample" has a "when" on "best_month" that throws on empty answers',
    ]);
  });

  it("catches one phase that cannot fit one call with its repair (spec 0013, AC-10)", () => {
    const broken = withPhases(sampleTool, [
      { ...firstPhase(sampleTool), timeoutMs: MAX_CALL_MS / 2 + 1 },
    ]);
    expect(contractViolations([broken])).toEqual([
      `tool "sample" needs up to ${MAX_CALL_MS + 2}ms in one call (two tries per phase), over ${MAX_CALL_MS}`,
    ]);
  });

  it("sums the phases of one call, unless the tool runs one phase per call", () => {
    const slow = (key: "one" | "two" | "three"): ReportPhase => ({
      ...firstPhase(threePhaseTool),
      key,
      timeoutMs: 100_000,
    });
    const together = withPhases(threePhaseTool, [
      slow("one"),
      slow("two"),
      slow("three"),
    ]);
    expect(contractViolations([together])).toEqual([
      'tool "three-phase" needs up to 600000ms in one call (two tries per phase), over 280000',
    ]);
    expect(contractViolations([{ ...together, phasesPerCall: 1 }])).toEqual([]);
  });
});
