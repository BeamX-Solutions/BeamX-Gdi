/**
 * Luna's links to the business profile (spec 0012, AC-12; spec 0013, AC-12): its seven
 * business questions map to the shared fact catalog, so what a client told Beacon is
 * offered here, and what they tell Luna is kept for the next tool.
 */
import type { QuestionFact, ToolQuestion } from "../_contract";
import { choiceFact, industryFact, rangeFact, textFact } from "../_kit/facts";
import { lunaQuestionList } from "./questions";

const links: Readonly<Record<string, QuestionFact>> = {
  "business-name": textFact("business_name"),
  "business-website": textFact("business_website"),
  industry: industryFact({
    "professional-services": "professional_services",
    healthcare: "healthcare",
    ecommerce: "ecommerce",
    restaurants: "restaurants",
    "b2b-software": "b2b_software",
    "real-estate": "real_estate",
    fitness: "fitness",
    "home-services": "home_services",
    manufacturing: "manufacturing",
    education: "education",
    "financial-services": "financial_services",
    nonprofit: "nonprofit",
    travel: "travel",
    technology: "technology",
    retail: "retail",
    logistics: "logistics",
    "media-entertainment": "media_entertainment",
    hospitality: "hospitality",
  }),
  "company-size": rangeFact("team_size", {
    "just-me-1": { min: 1, max: 1 },
    "2-5-employees": { min: 2, max: 5 },
    "6-20-employees": { min: 6, max: 20 },
    "21-50-employees": { min: 21, max: 50 },
    "50-plus-employees": { min: 50, max: null },
  }),
  "years-in-operation": rangeFact("years_in_business", {
    "pre-launch": { min: 0, max: 0 },
    "less-than-1-year": { min: 0, max: 1 },
    "1-2-years": { min: 1, max: 2 },
    "3-5-years": { min: 3, max: 5 },
    "6-10-years": { min: 6, max: 10 },
    "10-plus-years": { min: 10, max: null },
  }),
  "business-model": choiceFact("business_model", {
    b2b: "b2b",
    b2c: "b2c",
    b2b2c: "b2b2c",
    marketplace: "marketplace",
  }),
  "geographic-scope": choiceFact("geographic_scope", {
    "local-city": "local",
    "regional-state": "regional",
    national: "national",
    international: "international",
  }),
};

/** Luna's questions with their profile links attached. */
export const lunaQuestions: readonly ToolQuestion[] = lunaQuestionList.map(
  (q) => {
    const fact = links[q.id];
    return fact === undefined ? q : { ...q, fact };
  },
);
