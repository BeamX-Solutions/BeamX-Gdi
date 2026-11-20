import { describe, expect, it } from "vitest";
import { costUsd, modelPrices } from "@/lib/ai-cost";
import { modelRoles } from "@/tools/registry";
import { modelConfigs, modelIds } from "./models";

describe("models and prices (spec 0005, AC-12, AC-14)", () => {
  it("maps every model role a phase may name", () => {
    for (const role of modelRoles) expect(modelConfigs[role]).toBeDefined();
  });

  it("uses Opus 5.5 at medium effort for reports (spec 0006, AC-13)", () => {
    expect(modelConfigs.report).toEqual({
      id: "claude-opus-5-5",
      effort: "medium",
    });
  });

  it("has a price for every model id in use", () => {
    for (const id of modelIds)
      expect(Object.hasOwn(modelPrices, id)).toBe(true);
  });
});

describe("costUsd", () => {
  it("prices plain input, output and cache tokens apart", () => {
    // 1M plain input ($4) + 1M output ($20) + 1M cache read ($0.20) + 1M write ($5)
    expect(
      costUsd("claude-opus-5-5", {
        inputTokens: 3_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      }),
    ).toEqual({ ok: true, value: "29.200000" });
  });

  it("treats missing counts as zero", () => {
    expect(costUsd("claude-opus-5-5", { outputTokens: 50 })).toEqual({
      ok: true,
      value: "0.001000",
    });
  });

  it("returns unknown_model for a model with no price", () => {
    expect(costUsd("ghost-model", {})).toEqual({
      ok: false,
      error: { code: "unknown_model", model: "ghost-model" },
    });
  });
});
