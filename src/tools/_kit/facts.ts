/**
 * The business profile fact catalog (spec 0012, AC-1 to AC-4). Facts are stored once in
 * a canonical, tool neutral form; each tool question maps to and from it with two pure
 * functions (`QuestionFact`). A fact is offered to a question only when exactly one of
 * its options covers it, never as a guess. Pure.
 */
import { z } from "zod";
import type { AnswerValue, QuestionFact, QuestionView } from "../_contract";
import { parseAnswer } from "./answer-schema";

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

/** A range in whole units; `max` null means open ended ("10+"). */
export type Range = { readonly min: number; readonly max: number | null };

const rangeSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0).nullable(),
  })
  .refine((r) => r.max === null || r.max >= r.min, "max is below min");

/** Canonical industries; a narrower one names its broader parent (appendix of 0012). */
export const industries = {
  retail: null,
  ecommerce: "retail",
  food_beverage: null,
  restaurants: "food_beverage",
  professional_services: null,
  financial_services: "professional_services",
  real_estate: null,
  beauty_personal_care: null,
  fitness: "beauty_personal_care",
  logistics: null,
  travel: "logistics",
  manufacturing: null,
  hospitality: null,
  construction: null,
  home_services: "construction",
  healthcare: null,
  education: null,
  agriculture: null,
  technology: null,
  b2b_software: "technology",
  media_entertainment: null,
  nonprofit: null,
} as const satisfies Readonly<Record<string, string | null>>;

export type Industry = keyof typeof industries;

const industryValues = Object.keys(industries) as [Industry, ...Industry[]];

/** Plain labels for canonical industries (the profile page and its edit card). */
export const industryLabels: Readonly<Record<Industry, string>> = {
  retail: "Retail and trade",
  ecommerce: "E-commerce",
  food_beverage: "Food and beverage",
  restaurants: "Restaurants",
  professional_services: "Professional services",
  financial_services: "Financial services",
  real_estate: "Real estate",
  beauty_personal_care: "Beauty and personal care",
  fitness: "Fitness",
  logistics: "Logistics and transport",
  travel: "Travel",
  manufacturing: "Manufacturing",
  hospitality: "Hospitality",
  construction: "Construction and trades",
  home_services: "Home services",
  healthcare: "Healthcare",
  education: "Education and training",
  agriculture: "Agriculture",
  technology: "Technology",
  b2b_software: "B2B software",
  media_entertainment: "Media and entertainment",
  nonprofit: "Nonprofit",
};

export const businessModels = ["b2b", "b2c", "b2b2c", "marketplace"] as const;
export const geographicScopes = [
  "local",
  "regional",
  "national",
  "international",
] as const;

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

const textValue = (max: number) => z.string().trim().min(1).max(max);

/** Every profile key with its value schema and plain label (AC-1). */
export const factCatalog = {
  business_name: { label: "Business name", schema: textValue(100) },
  business_website: {
    label: "Website",
    schema: z
      .string()
      .trim()
      .max(200)
      .refine((u) => /^https:\/\/\S+\.\S+$/.test(u), "Use an https address."),
  },
  industry: { label: "Industry", schema: z.enum(industryValues) },
  years_in_business: { label: "Years in business", schema: rangeSchema },
  team_size: { label: "Team size", schema: rangeSchema },
  business_model: { label: "Business model", schema: z.enum(businessModels) },
  geographic_scope: { label: "Market reach", schema: z.enum(geographicScopes) },
} as const satisfies Readonly<
  Record<string, { readonly label: string; readonly schema: z.ZodType }>
>;

export type FactKey = keyof typeof factCatalog;

export const factKeys = Object.keys(factCatalog) as [FactKey, ...FactKey[]];

export const isFactKey = (key: string): key is FactKey =>
  Object.hasOwn(factCatalog, key);

/** A stored value parsed by its key's schema, or null when it does not fit. */
export const parseFact = (key: string, value: unknown): unknown => {
  if (!isFactKey(key)) return null;
  const parsed = factCatalog[key].schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

type Unit = { readonly one: string; readonly many: string };

const YEAR: Unit = { one: "year", many: "years" };
const PERSON: Unit = { one: "person", many: "people" };

const count = (n: number, unit: Unit) =>
  `${n} ${n === 1 ? unit.one : unit.many}`;

/** A range in words: "1 to 3 years", "10+ years", "Less than 1 year". */
const formatRange = (r: Range, unit: Unit): string => {
  if (r.max === null) return `${r.min}+ ${unit.many}`;
  if (r.min === r.max) return count(r.min, unit);
  if (r.min === 0) return `Less than ${count(r.max, unit)}`;
  return `${r.min} to ${r.max} ${unit.many}`;
};

const modelLabels: Readonly<Record<(typeof businessModels)[number], string>> = {
  b2b: "Sells to businesses (B2B)",
  b2c: "Sells to consumers (B2C)",
  b2b2c: "Sells to businesses that serve consumers (B2B2C)",
  marketplace: "Marketplace",
};

const scopeLabels: Readonly<Record<(typeof geographicScopes)[number], string>> =
  {
    local: "Local or city",
    regional: "Regional or state",
    national: "National",
    international: "International",
  };

/** A parsed fact value in plain words (the profile page). */
export const formatFact = (key: FactKey, value: unknown): string => {
  const parsed = parseFact(key, value);
  if (parsed === null) return "";
  switch (key) {
    case "business_name":
    case "business_website":
      return String(parsed);
    case "industry":
      return industryLabels[parsed as Industry];
    case "years_in_business": {
      const r = parsed as Range;
      return r.min === 0 && r.max === 0
        ? "Not started yet"
        : formatRange(r, YEAR);
    }
    case "team_size": {
      const r = parsed as Range;
      return r.min === 1 && r.max === 1 ? "Just me" : formatRange(r, PERSON);
    }
    case "business_model":
      return modelLabels[parsed as (typeof businessModels)[number]];
    case "geographic_scope":
      return scopeLabels[parsed as (typeof geographicScopes)[number]];
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
};

// ---------------------------------------------------------------------------
// Question mappings
// ---------------------------------------------------------------------------

/** A text answer as the fact itself (business name, website). */
export const textFact = (key: FactKey): QuestionFact => ({
  key,
  toFact: (answer) => parseFact(key, answer),
  fromFact: (fact) => {
    const parsed = parseFact(key, fact);
    return typeof parsed === "string" ? parsed : null;
  },
});

/** `fact` fits inside `bucket`. */
const within = (fact: Range, bucket: Range): boolean =>
  fact.min >= bucket.min &&
  (bucket.max === null || (fact.max !== null && fact.max <= bucket.max));

/** The one key whose value satisfies `covers`, or null for none or several (AC-3, AC-4). */
const onlyOne = <V>(
  map: Readonly<Record<string, V>>,
  covers: (v: V) => boolean,
): string | null => {
  const hits = Object.entries(map).filter(([, v]) => covers(v));
  return hits.length === 1 ? (hits[0]?.[0] ?? null) : null;
};

/**
 * A bucketed answer (years, team size) as a range. Read back only when exactly one
 * bucket contains the stored range (AC-3).
 */
export const rangeFact = (
  key: "years_in_business" | "team_size",
  buckets: Readonly<Record<string, Range>>,
): QuestionFact => ({
  key,
  toFact: (answer) =>
    typeof answer === "string" && Object.hasOwn(buckets, answer)
      ? (buckets[answer] ?? null)
      : null,
  fromFact: (fact) => {
    const parsed = rangeSchema.safeParse(fact);
    return parsed.success
      ? onlyOne(buckets, (b) => within(parsed.data, b))
      : null;
  },
});

/**
 * A choice answer (industry) mapped to canonical values. An option that maps to the
 * stored value itself wins; otherwise exactly one option mapping to its parent may read
 * it. Options mapped to null ("Other") store nothing (AC-4).
 */
export const industryFact = (
  options: Readonly<Record<string, Industry | null>>,
): QuestionFact => ({
  key: "industry",
  toFact: (answer) =>
    typeof answer === "string" ? (options[answer] ?? null) : null,
  fromFact: (fact) => {
    const parsed = factCatalog.industry.schema.safeParse(fact);
    if (!parsed.success) return null;
    const value = parsed.data;
    const parent: string | null = industries[value];
    return (
      onlyOne(options, (o) => o === value) ??
      (parent === null ? null : onlyOne(options, (o) => o === parent))
    );
  },
});

/** A choice answer that maps one to one onto a canonical enum (model, reach). */
export const choiceFact = (
  key: "business_model" | "geographic_scope",
  options: Readonly<Record<string, string>>,
): QuestionFact => ({
  key,
  toFact: (answer) =>
    typeof answer === "string" ? parseFact(key, options[answer]) : null,
  fromFact: (fact) => {
    const parsed = parseFact(key, fact);
    return parsed === null ? null : onlyOne(options, (o) => o === parsed);
  },
});

/** The answer a question would take from a stored fact, if any. */
export const answerFromFact = (
  fact: QuestionFact,
  stored: unknown,
): AnswerValue | null => fact.fromFact(stored);

// ---------------------------------------------------------------------------
// Edit cards (the profile page, spec 0012 AC-8)
// ---------------------------------------------------------------------------

/** The card a profile edit shows for a key, and how its answer maps to the fact. */
export type FactEditor = {
  readonly question: QuestionView;
  readonly fact: QuestionFact;
};

const yearBuckets = {
  "less-than-1": { min: 0, max: 1 },
  "1-2": { min: 1, max: 2 },
  "3-5": { min: 3, max: 5 },
  "6-10": { min: 6, max: 10 },
  "10-plus": { min: 10, max: null },
} as const satisfies Readonly<Record<string, Range>>;

const teamBuckets = {
  "just-me": { min: 1, max: 1 },
  "2-5": { min: 2, max: 5 },
  "6-20": { min: 6, max: 20 },
  "21-50": { min: 21, max: 50 },
  "50-plus": { min: 50, max: null },
} as const satisfies Readonly<Record<string, Range>>;

const options = (
  labels: Readonly<Record<string, string>>,
): readonly { readonly value: string; readonly label: string }[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const single = (
  key: FactKey,
  labels: Readonly<Record<string, string>>,
): QuestionView => ({
  kind: "single",
  id: key,
  prompt: factCatalog[key].label,
  options: options(labels),
});

/** One edit card per key (AC-8). */
export const factEditors: Readonly<Record<FactKey, FactEditor>> = {
  business_name: {
    question: {
      kind: "text",
      id: "business_name",
      prompt: "Business name",
      input: "text",
      maxLength: 100,
    },
    fact: textFact("business_name"),
  },
  business_website: {
    question: {
      kind: "text",
      id: "business_website",
      prompt: "Website",
      input: "text",
      maxLength: 200,
      placeholder: "https://www.example.com",
    },
    fact: textFact("business_website"),
  },
  industry: {
    question: single("industry", industryLabels),
    fact: industryFact(
      Object.fromEntries(industryValues.map((v) => [v, v])) as Record<
        string,
        Industry
      >,
    ),
  },
  years_in_business: {
    question: single("years_in_business", {
      "less-than-1": "Less than 1 year",
      "1-2": "1 to 2 years",
      "3-5": "3 to 5 years",
      "6-10": "6 to 10 years",
      "10-plus": "10+ years",
    }),
    fact: rangeFact("years_in_business", yearBuckets),
  },
  team_size: {
    question: single("team_size", {
      "just-me": "Just me",
      "2-5": "2 to 5 people",
      "6-20": "6 to 20 people",
      "21-50": "21 to 50 people",
      "50-plus": "50+ people",
    }),
    fact: rangeFact("team_size", teamBuckets),
  },
  business_model: {
    question: single("business_model", modelLabels),
    fact: choiceFact(
      "business_model",
      Object.fromEntries(businessModels.map((v) => [v, v])),
    ),
  },
  geographic_scope: {
    question: single("geographic_scope", scopeLabels),
    fact: choiceFact(
      "geographic_scope",
      Object.fromEntries(geographicScopes.map((v) => [v, v])),
    ),
  },
};

/**
 * A profile edit checked end to end (AC-8): the key is in the catalog, the answer fits
 * the key's edit card, and it maps to a valid fact. Pure.
 */
export const factFromEdit = (
  key: string,
  answer: unknown,
): { readonly key: FactKey; readonly value: unknown } | null => {
  if (!isFactKey(key)) return null;
  const editor = factEditors[key];
  const parsed = parseAnswer({ questions: [editor.question] }, key, answer);
  if (!parsed.ok) return null;
  const value = parseFact(key, editor.fact.toFact(parsed.value));
  return value === null ? null : { key, value };
};
