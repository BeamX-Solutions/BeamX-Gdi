import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

const pg = {
  code: "23505",
  constraint: "tool_run_one_active_per_conversation",
};

describe("isUniqueViolation", () => {
  it("matches the named constraint directly or through the cause chain", () => {
    expect(isUniqueViolation(pg, pg.constraint)).toBe(true);
    expect(
      isUniqueViolation(
        new Error("query failed", { cause: { cause: pg } }),
        pg.constraint,
      ),
    ).toBe(true);
  });

  it("ignores other constraints, other codes and non objects", () => {
    expect(isUniqueViolation(pg, "report_run_unique")).toBe(false);
    expect(isUniqueViolation({ ...pg, code: "23503" }, pg.constraint)).toBe(
      false,
    );
    expect(isUniqueViolation(null, pg.constraint)).toBe(false);
    expect(isUniqueViolation("23505", pg.constraint)).toBe(false);
  });

  it("stops after a few levels of cause", () => {
    const deep = { cause: { cause: { cause: { cause: pg } } } };
    expect(isUniqueViolation(deep, pg.constraint)).toBe(false);
  });
});
