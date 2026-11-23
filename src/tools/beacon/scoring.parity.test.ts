/**
 * Spec 0010, AC-5: the port scores all 200 cases in fixtures/parity/beacon/scoring.json
 * exactly like the standalone Beacon.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bandLabels, categoryKeys } from "./categories";
import { fixtureAnswersSchema, toAnswers } from "./parity-fixtures";
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

const categorySchema = z.object({
  name: z.string(),
  score: z.number(),
  max: z.number(),
  percentage: z.number(),
  grade: z.string(),
  insights: z.array(z.string()),
});

const fixture = z
  .object({
    cases: z.array(
      z.object({
        name: z.string(),
        answers: fixtureAnswersSchema,
        expected: z.object({
          total_score: z.number(),
          readiness_level: z.string(),
          breakdown: z.object({
            financial_health: categorySchema,
            customer_strength: categorySchema,
            operational_maturity: categorySchema,
            financial_intelligence: categorySchema,
            growth_resilience: categorySchema,
          }),
          flags: z.object({
            critical: z.array(z.string()),
            opportunities: z.array(z.string()),
          }),
        }),
      }),
    ),
  })
  .parse(loadFixture("scoring.json"));

/** "🔨 Building Blocks" to "Building Blocks". */
const withoutEmoji = (level: string): string => level.replace(/^\S+\s+/, "");

describe("Beacon scoring parity (AC-5)", () => {
  it("has all 200 cases", () => {
    expect(fixture.cases).toHaveLength(200);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "%s",
    (_name, { answers, expected }) => {
      const result = scoreBeacon(toAnswers(answers));
      if (!result.ok) throw new Error("incomplete");
      const scores = result.value;
      expect(scores.total).toBe(expected.total_score);
      expect(bandLabels[scores.band]).toBe(
        withoutEmoji(expected.readiness_level),
      );
      for (const key of categoryKeys) {
        expect(scores.categories[key], key).toEqual(expected.breakdown[key]);
      }
      expect(scores.flags).toEqual(expected.flags);
    },
  );
});
