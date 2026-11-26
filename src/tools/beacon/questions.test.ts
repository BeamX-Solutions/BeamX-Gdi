/**
 * Spec 0010, AC-2 and AC-3: 23 questions in order, frozen slugs that match the slug
 * rule over the standalone labels, three profile facts, and the business name limits.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseAnswer } from "../_kit/answer-schema";
import { toId } from "./parity-fixtures";
import { beaconQuestions } from "./questions";

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../fixtures/parity/beacon/${name}`, import.meta.url),
      ),
      "utf8",
    ),
  );

const fields = z
  .object({
    fields: z.record(
      z.string(),
      z.union([z.array(z.string()), z.object({ type: z.string() })]),
    ),
  })
  .parse(loadFixture("questions.json")).fields;

/** The slug rule (spec 0010, "Questions"). */
const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const choiceFields = Object.entries(fields).flatMap(([field, value]) =>
  Array.isArray(value) ? [[field, value] as const] : [],
);

describe("Beacon questions (AC-2, AC-3)", () => {
  it("has the business name, then the 22 Beacon questions in form order", () => {
    expect(beaconQuestions.map((q) => q.id)).toEqual([
      "business_name",
      ...choiceFields.map(([field]) => toId(field)),
    ]);
    expect(beaconQuestions).toHaveLength(23);
  });

  it("never asks for a full name or email", () => {
    const ids = beaconQuestions.map((q) => q.id);
    expect(ids).not.toContain("full_name");
    expect(ids).not.toContain("email");
  });

  it.each(choiceFields)(
    "%s keeps the standalone labels, with slugs made by the rule",
    (field, labels) => {
      const question = beaconQuestions.find((q) => q.id === toId(field));
      if (question?.kind !== "single") throw new Error(`${field} not single`);
      expect(question.options.map((o) => o.label)).toEqual(labels);
      expect(question.options.map((o) => o.value)).toEqual(labels.map(slug));
      const values = question.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    },
  );

  it("matches the spec's slug examples", () => {
    expect(
      [
        "30%+",
        "Less than 5% or negative",
        "Don't know",
        "Retail/Trade",
        "Food & Beverage",
        "Not applicable (service business)",
        "Stable (±5%)",
      ].map(slug),
    ).toEqual([
      "30-pct-plus",
      "less-than-5-pct-or-negative",
      "dont-know",
      "retail-trade",
      "food-and-beverage",
      "not-applicable-service-business",
      "stable-5-pct",
    ]);
  });

  it("links the business name, industry and years to profile facts only (spec 0012)", () => {
    expect(
      beaconQuestions.flatMap((q) =>
        q.fact === undefined ? [] : [[q.id, q.fact.key]],
      ),
    ).toEqual([
      ["business_name", "business_name"],
      ["industry", "industry"],
      ["years_in_business", "years_in_business"],
    ]);
  });

  it("trims the business name and allows 1 to 100 characters", () => {
    const tool = { questions: beaconQuestions };
    expect(parseAnswer(tool, "business_name", "  Ada Foods  ")).toEqual({
      ok: true,
      value: "Ada Foods",
    });
    expect(parseAnswer(tool, "business_name", "x".repeat(100)).ok).toBe(true);
    expect(parseAnswer(tool, "business_name", "x".repeat(101)).ok).toBe(false);
    expect(parseAnswer(tool, "business_name", "   ").ok).toBe(false);
  });

  it("groups every question into an area", () => {
    expect(beaconQuestions.every((q) => q.area !== undefined)).toBe(true);
  });
});
