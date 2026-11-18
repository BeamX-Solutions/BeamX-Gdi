import { describe, expect, it } from "vitest";
import { barFraction, barText } from "./bar-math";

describe("barFraction", () => {
  it("is score over max", () => {
    expect(barFraction(6, 10)).toBe(0.6);
  });
  it("clamps to 0..1", () => {
    expect(barFraction(14, 10)).toBe(1);
    expect(barFraction(-3, 10)).toBe(0);
  });
  it("gives an empty bar for a bad max or score", () => {
    expect(barFraction(5, 0)).toBe(0);
    expect(barFraction(5, -2)).toBe(0);
    expect(barFraction(Number.NaN, 10)).toBe(0);
    expect(barFraction(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("barText", () => {
  it("reads as score/max", () => {
    expect(barText(6, 10)).toBe("6/10");
  });
});
