import { describe, expect, it } from "vitest";
import { beaconQuestions } from "../beacon/questions";
import {
  choiceFact,
  factCatalog,
  factEditors,
  factFromEdit,
  factKeys,
  formatFact,
  industryFact,
  parseFact,
  rangeFact,
  textFact,
} from "./facts";

// Spec 0012, AC-1 to AC-4: the catalog and the exact mapping rule.

const beaconFact = (id: string) => {
  const fact = beaconQuestions.find((q) => q.id === id)?.fact;
  if (!fact) throw new Error(`no fact on ${id}`);
  return fact;
};

/** Luna's buckets and industries (spec 0013 links them the same way). */
const lunaYears = rangeFact("years_in_business", {
  "pre-launch": { min: 0, max: 0 },
  "less-than-1-year": { min: 0, max: 1 },
  "1-2-years": { min: 1, max: 2 },
  "3-5-years": { min: 3, max: 5 },
  "6-10-years": { min: 6, max: 10 },
  "10-plus-years": { min: 10, max: null },
});

const lunaIndustry = industryFact({
  retail: "retail",
  ecommerce: "ecommerce",
  restaurants: "restaurants",
  "real-estate": "real_estate",
  technology: "technology",
});

describe("the catalog (AC-1)", () => {
  it("lists the seven keys with labels", () => {
    expect(Object.keys(factCatalog)).toEqual([
      "business_name",
      "business_website",
      "industry",
      "years_in_business",
      "team_size",
      "business_model",
      "geographic_scope",
    ]);
  });

  it("parses values by key and refuses what does not fit", () => {
    expect(parseFact("business_name", "  Ada Foods ")).toBe("Ada Foods");
    expect(parseFact("business_name", "")).toBeNull();
    expect(parseFact("business_website", "http://ada.ng")).toBeNull();
    expect(parseFact("business_website", "https://ada.ng")).toBe(
      "https://ada.ng",
    );
    expect(parseFact("years_in_business", { min: 3, max: 1 })).toBeNull();
    expect(parseFact("industry", "space_travel")).toBeNull();
    expect(parseFact("unknown_key", "x")).toBeNull();
  });

  it("formats values in plain words", () => {
    expect(formatFact("years_in_business", { min: 1, max: 3 })).toBe(
      "1 to 3 years",
    );
    expect(formatFact("years_in_business", { min: 10, max: null })).toBe(
      "10+ years",
    );
    expect(formatFact("years_in_business", { min: 0, max: 1 })).toBe(
      "Less than 1 year",
    );
    expect(formatFact("years_in_business", { min: 0, max: 0 })).toBe(
      "Not started yet",
    );
    expect(formatFact("team_size", { min: 1, max: 1 })).toBe("Just me");
    expect(formatFact("team_size", { min: 50, max: null })).toBe("50+ people");
    expect(formatFact("industry", "restaurants")).toBe("Restaurants");
    expect(formatFact("industry", "nope")).toBe("");
  });
});

describe("ranges read back only into exactly one bucket (AC-3)", () => {
  it("does not give Beacon's 1-3 years to Luna", () => {
    const stored = beaconFact("years_in_business").toFact("1-3-years");
    expect(stored).toEqual({ min: 1, max: 3 });
    expect(lunaYears.fromFact(stored)).toBeNull();
  });

  it("gives Luna's 3-5 years and 1-2 years to Beacon", () => {
    const beacon = beaconFact("years_in_business");
    expect(beacon.fromFact(lunaYears.toFact("3-5-years"))).toBe("3-5-years");
    expect(beacon.fromFact(lunaYears.toFact("1-2-years"))).toBe("1-3-years");
    expect(beacon.fromFact(lunaYears.toFact("6-10-years"))).toBe("5-10-years");
  });

  it("reads Luna's pre-launch as Beacon's less than 1 year", () => {
    expect(
      beaconFact("years_in_business").fromFact(lunaYears.toFact("pre-launch")),
    ).toBe("less-than-1-year");
  });

  it("ignores garbage", () => {
    expect(lunaYears.toFact("nope")).toBeNull();
    expect(lunaYears.fromFact("3-5")).toBeNull();
  });
});

describe("industries read back through the hierarchy (AC-4)", () => {
  it("gives Luna's restaurants to Beacon as food and beverage", () => {
    expect(
      beaconFact("industry").fromFact(lunaIndustry.toFact("restaurants")),
    ).toBe("food-and-beverage");
  });

  it("does not give Beacon's food and beverage to Luna", () => {
    const stored = beaconFact("industry").toFact("food-and-beverage");
    expect(stored).toBe("food_beverage");
    expect(lunaIndustry.fromFact(stored)).toBeNull();
  });

  it("reads e-commerce as retail for Beacon, but stays exact for Luna", () => {
    const stored = lunaIndustry.toFact("ecommerce");
    expect(beaconFact("industry").fromFact(stored)).toBe("retail-trade");
    expect(lunaIndustry.fromFact(stored)).toBe("ecommerce");
  });

  it("stores nothing for Beacon's Other, and never offers real estate to Beacon", () => {
    expect(beaconFact("industry").toFact("other")).toBeNull();
    expect(
      beaconFact("industry").fromFact(lunaIndustry.toFact("real-estate")),
    ).toBeNull();
  });
});

describe("text and choice facts", () => {
  it("passes text through its schema", () => {
    const name = textFact("business_name");
    expect(name.toFact(" Ada ")).toBe("Ada");
    expect(name.fromFact("Ada")).toBe("Ada");
    expect(name.fromFact(42)).toBeNull();
  });

  it("maps choices one to one", () => {
    const model = choiceFact("business_model", { B2B: "b2b", B2C: "b2c" });
    expect(model.toFact("B2B")).toBe("b2b");
    expect(model.fromFact("b2c")).toBe("B2C");
    expect(model.fromFact("marketplace")).toBeNull();
    expect(model.toFact("Other")).toBeNull();
  });
});

describe("edit cards (AC-8)", () => {
  it("has one card per key, and every option reads back as itself", () => {
    expect(Object.keys(factEditors)).toEqual(factKeys);
    for (const key of factKeys) {
      const { question, fact } = factEditors[key];
      if (question.kind !== "single") continue;
      for (const option of question.options)
        expect(fact.fromFact(fact.toFact(option.value))).toBe(option.value);
    }
  });

  it("checks an edit against its card and the catalog", () => {
    expect(factFromEdit("industry", "restaurants")).toEqual({
      key: "industry",
      value: "restaurants",
    });
    expect(factFromEdit("years_in_business", "6-10")).toEqual({
      key: "years_in_business",
      value: { min: 6, max: 10 },
    });
    expect(factFromEdit("business_website", "https://ada.ng")).toEqual({
      key: "business_website",
      value: "https://ada.ng",
    });
    expect(factFromEdit("business_website", "ada.ng")).toBeNull();
    expect(factFromEdit("industry", "space")).toBeNull();
    expect(factFromEdit("not_a_key", "x")).toBeNull();
    expect(factFromEdit("business_name", "")).toBeNull();
  });

  it("opens Beacon's 1-3 years fact on no edit bucket, since none holds it exactly", () => {
    expect(
      factEditors.years_in_business.fact.fromFact({ min: 1, max: 3 }),
    ).toBeNull();
  });
});
