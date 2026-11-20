/**
 * Spec 0005, AC-5: the port scores all 75 cases in fixtures/parity/stellar/scoring.json
 * exactly like the original, with the two documented differences.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Answers } from "../_contract";
import { visibleAnswers } from "../_kit/flow";
import { stellarQuestions } from "./questions";
import { calculateScore, scoreStellar } from "./scoring";

const fixtureSchema = z.object({
  cases: z.array(
    z.object({
      name: z.string(),
      responses: z.array(
        z.object({
          questionId: z.number().int(),
          answer: z.string(),
          followUpAnswer: z.string().optional(),
        }),
      ),
      expected: z.object({
        score: z.object({
          level: z.string(),
          score: z.number(),
          totalPositive: z.number(),
          title: z.string(),
          summary: z.string(),
          actionItems: z.array(z.string()),
          timeframe: z.string(),
        }),
        dimensions: z.array(
          z.object({
            name: z.string(),
            score: z.number(),
            maxScore: z.number(),
          }),
        ),
      }),
    }),
  ),
});

const fixture = fixtureSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../../fixtures/parity/stellar/scoring.json",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  ),
);

/** Original question number to stored id (spec 0005, "Stellar question ids"). */
const ids: Readonly<Record<number, string>> = {
  1: "foundation",
  2: "value_creation",
  3: "market_validation",
  4: "investment",
  5: "skills",
  6: "speed",
  7: "passion_market_fit",
  8: "competitors",
  9: "learning",
  10: "commitment",
};

/** Where an original `followUpAnswer` is stored. */
const followUpIds: Readonly<Record<number, string>> = {
  4: "investment_detail",
  5: "skills_detail",
  6: "speed_detail",
  10: "commitment_detail",
};

const toAnswers = (
  responses: z.infer<typeof fixtureSchema>["cases"][number]["responses"],
): Answers =>
  Object.fromEntries(
    responses.flatMap((r) => {
      const id = ids[r.questionId];
      if (!id) throw new Error(`no id for question ${r.questionId}`);
      const followUpId = followUpIds[r.questionId];
      return [
        [id, r.answer] as const,
        ...(r.followUpAnswer !== undefined && followUpId
          ? [[followUpId, r.followUpAnswer] as const]
          : []),
      ];
    }),
  );

/** Known difference 2: the original calls dimension 8 "Motivation". */
const renamed = (name: string) =>
  name === "Motivation" ? "Competitor Awareness" : name;

describe("Stellar parity (AC-5)", () => {
  it("has all 75 cases", () => {
    expect(fixture.cases).toHaveLength(75);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "%s",
    (_name, testCase) => {
      const answers = visibleAnswers(
        { questions: stellarQuestions },
        toAnswers(testCase.responses),
      );
      const { dimensions, ...score } = calculateScore(answers);
      expect(score).toEqual(testCase.expected.score);
      expect(dimensions).toEqual(
        testCase.expected.dimensions.map((d) => ({
          ...d,
          name: renamed(d.name),
        })),
      );
    },
  );

  it("score gives the same result as the core for every case", () => {
    // `yellow-almost-without-followup` stores the follow up as "" (never storable in the
    // workspace, where parseAnswer rejects it): answered, so the core takes the generic
    // blocker item, as the original does.
    for (const c of fixture.cases) {
      const answers = toAnswers(c.responses);
      expect(scoreStellar(answers), c.name).toEqual({
        ok: true,
        value: calculateScore(
          visibleAnswers({ questions: stellarQuestions }, answers),
        ),
      });
    }
  });
});
