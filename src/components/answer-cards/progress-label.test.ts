import { describe, expect, it } from "vitest";
import { progressLabel } from "./progress-label";
import { scaleColumns } from "./scale";

describe("progressLabel (AC-8)", () => {
  it("shows area and question counts, starting at 1", () => {
    expect(
      progressLabel({
        area: { index: 3, total: 9, name: "Marketing" },
        question: { index: 4, total: 7 },
      }),
    ).toBe("Marketing · Area 3 of 9 · Question 4 of 7");
  });

  it("drops the area when there is none", () => {
    expect(progressLabel({ question: { index: 4, total: 7 } })).toBe(
      "Question 4 of 7",
    );
  });
});

describe("scaleColumns (AC-8)", () => {
  it("one row up to 7 points, two balanced rows past that", () => {
    expect(scaleColumns(5)).toBe(5);
    expect(scaleColumns(7)).toBe(7);
    expect(scaleColumns(10)).toBe(5);
    expect(scaleColumns(11)).toBe(6);
  });
});
