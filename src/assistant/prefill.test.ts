import { describe, expect, it } from "vitest";
import { getTool } from "@/tools/registry";
import {
  PREFILL_OFFER_TITLES,
  prefillOffers,
  prefillOfferTitle,
} from "./prefill";

// Spec 0012, AC-6 and AC-7: profile facts beside chat facts on the prefill card.

const beacon = (() => {
  const found = getTool("beacon");
  if (!found.ok) throw new Error("beacon is not registered");
  return found.value;
})();

const profile = [
  { key: "business_name", value: "Ada Foods" },
  { key: "industry", value: "restaurants" },
  { key: "years_in_business", value: { min: 1, max: 2 } },
];

describe("prefillOffers", () => {
  it("offers mapped profile facts for unanswered questions, in question order", () => {
    expect(prefillOffers(beacon, {}, [], profile)).toEqual([
      { questionId: "business_name", value: "Ada Foods", source: "profile" },
      { questionId: "industry", value: "food-and-beverage", source: "profile" },
      {
        questionId: "years_in_business",
        value: "1-3-years",
        source: "profile",
      },
    ]);
  });

  it("lets a chat fact win for the same question", () => {
    const offers = prefillOffers(
      beacon,
      {},
      [{ questionId: "business_name", value: "Ada's Kitchen" }],
      profile,
    );
    expect(offers[0]).toEqual({
      questionId: "business_name",
      value: "Ada's Kitchen",
      source: "chat",
    });
  });

  it("skips answered questions and facts no option covers", () => {
    expect(
      prefillOffers(
        beacon,
        { business_name: "Saved" },
        [],
        [
          { key: "business_name", value: "Ada Foods" },
          { key: "industry", value: "real_estate" },
          { key: "years_in_business", value: "garbage" },
        ],
      ),
    ).toEqual([]);
  });
});

describe("prefillOfferTitle (AC-7)", () => {
  it("names one source, or both", () => {
    const p = { questionId: "a", value: "x", source: "profile" } as const;
    const c = { questionId: "b", value: "y", source: "chat" } as const;
    expect(prefillOfferTitle([p])).toBe(PREFILL_OFFER_TITLES.profile);
    expect(prefillOfferTitle([c])).toBe(PREFILL_OFFER_TITLES.chat);
    expect(prefillOfferTitle([p, c])).toBe(PREFILL_OFFER_TITLES.both);
  });
});
