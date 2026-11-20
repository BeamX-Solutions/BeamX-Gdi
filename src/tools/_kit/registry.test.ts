import { describe, expect, it } from "vitest";
import { sampleTool } from "../test-tools/sample";
import { makeRegistry } from "./registry";

const registry = makeRegistry([sampleTool]);

describe("registry (AC-2)", () => {
  it("lists tool ids", () => {
    expect(registry.toolIds).toEqual(["sample"]);
  });

  it("finds a registered tool", () => {
    const result = registry.getTool("sample");
    expect(result.ok && result.value.id).toBe("sample");
  });

  it("returns unknown_tool for an id not in the registry", () => {
    expect(registry.getTool("ghost")).toEqual({
      ok: false,
      error: { code: "unknown_tool", id: "ghost" },
    });
    expect(registry.getReader("ghost", "1")).toEqual({
      ok: false,
      error: { code: "unknown_tool", id: "ghost" },
    });
  });

  it("returns the current module for the current version", () => {
    const result = registry.getReader("sample", "2");
    expect(result.ok && result.value).toBe(sampleTool);
  });

  it("returns the frozen reader for an older version", () => {
    const result = registry.getReader("sample", "1");
    if (!result.ok) throw new Error("expected a reader");
    expect(
      result.value.toView({
        scores: { total: 7 },
        content: { note: "hi" },
        answers: {},
      }),
    ).toEqual([{ kind: "text", title: "Old", paragraphs: ["hi", "7"] }]);
  });

  it("returns unsupported_version for a version it cannot read", () => {
    for (const version of ["3", "toString", "__proto__"]) {
      expect(registry.getReader("sample", version)).toEqual({
        ok: false,
        error: { code: "unsupported_version", id: "sample", version },
      });
    }
  });
});
