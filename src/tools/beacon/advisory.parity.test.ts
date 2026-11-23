/**
 * Spec 0010, AC-6: for all 34 cases in fixtures/parity/beacon/reports.json, the typed
 * advisory renders to the standalone's `structured_advisory` byte for byte.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { advisorySchema } from "./advisory";
import { advisoryMarkdown } from "./advisory-markdown";
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

const fixture = z
  .object({
    cases: z.array(
      z.object({
        name: z.string(),
        answers: fixtureAnswersSchema,
        expected: z.object({
          beacon: z.object({ structured_advisory: z.string() }),
        }),
      }),
    ),
  })
  .parse(loadFixture("reports.json"));

const advisoryOf = (answers: Readonly<Record<string, string>>) => {
  const result = scoreBeacon(toAnswers(answers));
  if (!result.ok) throw new Error("incomplete");
  return result.value.advisory;
};

describe("Beacon advisory parity (AC-6)", () => {
  it("has all 34 cases", () => {
    expect(fixture.cases).toHaveLength(34);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "%s",
    (_name, { answers, expected }) => {
      expect(advisoryMarkdown(advisoryOf(answers))).toBe(
        expected.beacon.structured_advisory,
      );
    },
  );

  it("every case's advisory passes its own schema", () => {
    for (const c of fixture.cases) {
      expect(
        advisorySchema.safeParse(advisoryOf(c.answers)).success,
        c.name,
      ).toBe(true);
    }
  });
});
