/**
 * Spec 0010, AC-4: completeness. The scores themselves are checked against the
 * standalone in `scoring.parity.test.ts`. Since v2 (spec 0011) the scores carry no
 * rule based advisory.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toAnswers } from "./parity-fixtures";
import { beaconQuestions } from "./questions";
import { scoreBeacon } from "./scoring";

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../fixtures/parity/beacon/${name}`, import.meta.url),
      ),
      "utf8",
    ),
  );

describe("scoreBeacon (AC-4)", () => {
  const allBest = toAnswers(
    (
      loadFixture("reports.json") as {
        cases: { answers: Record<string, string> }[];
      }
    ).cases[0]?.answers ?? {},
  );

  it("returns incomplete with the missing id when one answer is left out", () => {
    const rest = Object.fromEntries(
      Object.entries(allBest).filter(([id]) => id !== "cash_runway"),
    );
    expect(scoreBeacon(rest)).toEqual({
      ok: false,
      error: { code: "incomplete", missing: ["cash_runway"] },
    });
  });

  it("lists every question when nothing is answered", () => {
    const result = scoreBeacon({});
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.missing).toEqual(beaconQuestions.map((q) => q.id));
  });

  it("returns the total, band, categories and flags, and no advisory", () => {
    const result = scoreBeacon(allBest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(100);
    expect(result.value.band).toBe("scale_ready");
    expect(Object.keys(result.value).sort()).toEqual([
      "band",
      "categories",
      "flags",
      "total",
    ]);
  });
});
