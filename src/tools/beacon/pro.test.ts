/**
 * Spec 0011: Beacon Pro's module, prompt, check and view (AC-1, AC-2, AC-9 to AC-13).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Answers, PhaseContext } from "../_contract";
import { contractViolations } from "../_kit/contract-check";
import { tools } from "../registry";
import { beacon, beaconPro } from ".";
import { flagLabel } from "./flags";
import { fixtureAnswersSchema, toAnswers } from "./parity-fixtures";
import {
  checkProAdvisory,
  MAX_WORDS,
  MIN_WORDS,
  proAdvisoryPhase,
  proAdvisorySchema,
  type ProAdvisory,
  type ProPart,
} from "./pro-report";
import { beaconProPreview, beaconProView } from "./pro-view";
import { scoreBeacon, type BeaconScores } from "./scoring";

const ANSWERS: Answers = {
  business_name: "Ada <b>Foods</b>",
  industry: "food-and-beverage",
  years_in_business: "3-5-years",
  cash_flow: "burning-cash-consistently",
  profit_margin: "dont-know",
  cash_runway: "less-than-1-month",
  payment_speed: "1-7-days",
  repeat_customer_rate: "50-70-pct-repeat",
  acquisition_channel: "referrals-word-of-mouth",
  pricing_power: "most-customers-would-stay",
  founder_dependency: "must-be-there-daily",
  process_documentation: "some-key-processes-documented",
  inventory_tracking: "regular-manual-spreadsheet",
  expense_awareness: "know-roughly",
  profit_per_product: "good-sense-of-whats-profitable",
  pricing_strategy: "match-competitors",
  business_trajectory: "growing-5-20-pct",
  revenue_diversification: "2-3-streams",
  digital_payments: "50-80-pct-digital",
  formal_registration: "not-registered",
  infrastructure: "frequent-disruptions",
  banking_relationship: "accounts-but-no-credit",
  primary_pain_point: "managing-cash-flow-getting-paid",
};

const scoresOf = (answers: Answers): BeaconScores => {
  const scored = scoreBeacon(answers);
  if (!scored.ok) throw new Error("fixture answers are incomplete");
  return scored.value;
};

const scores = scoresOf(ANSWERS);

/** A paragraph of `n` plain words. */
const words = (n: number): ProPart => ({
  kind: "paragraph",
  text: Array.from({ length: n }, () => "word").join(" "),
});

/** A valid advisory for `scores`: both conditional sections present, 1000 words. */
const valid = (): ProAdvisory => ({
  executive_summary: [words(200)],
  critical_priorities: [
    { kind: "subheading", text: "Cash" },
    { kind: "bullets", items: [{ lead: "Week 1", text: "call every debtor" }] },
    words(195),
  ],
  strategic_recommendations: [words(200)],
  growth_opportunities: [words(200)],
  next_steps: [
    { kind: "numbered", items: [{ text: "Book a call" }] },
    words(200),
  ],
});

const ctx = (firstName: string | null): PhaseContext => ({
  answers: ANSWERS,
  scores,
  earlier: {},
  client: { firstName },
});

describe("the Beacon Pro module (AC-1)", () => {
  it("is registered beside Beacon with its own id, version and price", () => {
    expect(tools.map((t) => t.id)).toEqual(["stellar", "beacon", "beacon_pro"]);
    expect(beaconPro).toMatchObject({
      id: "beacon_pro",
      version: "1",
      name: "Beacon Pro",
      creditPrice: 150,
      reuseFrom: ["beacon", "beacon_pro"],
    });
    expect(contractViolations(tools)).toEqual([]);
  });

  it("shares Beacon's questions, scores schema and scoring", () => {
    expect(beaconPro.questions).toBe(beacon.questions);
    expect(beaconPro.scoresSchema).toBe(beacon.scoresSchema);
    expect(beaconPro.phases.map((p) => p.key)).toEqual(["advisory"]);
  });

  it("flags a reuseFrom id that is not registered", () => {
    expect(
      contractViolations([{ ...beaconPro, reuseFrom: ["nope"] }, beacon]),
    ).toContain(
      'beacon_pro reuses answers from "nope", which is not registered',
    );
  });
});

describe("Beacon Pro scoring parity (AC-2)", () => {
  const fixture = z
    .object({ cases: z.array(z.object({ answers: fixtureAnswersSchema })) })
    .parse(
      JSON.parse(
        readFileSync(
          fileURLToPath(
            new URL(
              "../../../fixtures/parity/beacon/scoring.json",
              import.meta.url,
            ),
          ),
          "utf8",
        ),
      ),
    );

  it("scores every Beacon fixture exactly like Beacon", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
    for (const c of fixture.cases) {
      const answers = { business_name: "Test", ...toAnswers(c.answers) };
      expect(beaconPro.score(answers)).toEqual(beacon.score(answers));
    }
  });
});

describe("the advisory check (AC-10)", () => {
  it("accepts a valid advisory", () => {
    expect(checkProAdvisory(valid(), scores)).toEqual([]);
  });

  it("needs critical_priorities exactly when there are critical flags", () => {
    expect(scores.flags.critical.length).toBeGreaterThan(0);
    const missing = {
      ...valid(),
      critical_priorities: null,
      executive_summary: [words(400)],
    };
    expect(checkProAdvisory(missing, scores)).toEqual([
      "critical_priorities is missing; there are critical flags, so write it",
    ]);
    const none = { ...scores.flags, critical: [] };
    expect(checkProAdvisory(valid(), { flags: none })).toContain(
      "critical_priorities must be null; there are no critical flags",
    );
  });

  it("needs growth_opportunities exactly when there are opportunity flags", () => {
    const missing = {
      ...valid(),
      growth_opportunities: null,
      executive_summary: [words(400)],
    };
    expect(checkProAdvisory(missing, scores)).toEqual([
      "growth_opportunities is missing; there are opportunity flags, so write it",
    ]);
    const none = { ...scores.flags, opportunities: [] };
    expect(checkProAdvisory(valid(), { flags: none })).toContain(
      "growth_opportunities must be null; there are no opportunity flags",
    );
  });

  it("rejects em dashes, en dashes and web addresses anywhere", () => {
    const dashed = (dash: string): ProAdvisory => ({
      ...valid(),
      next_steps: [
        words(199),
        { kind: "bullets", items: [{ lead: `Now ${dash} act`, text: "go" }] },
      ],
    });
    for (const dash of ["—", "–"])
      expect(checkProAdvisory(dashed(dash), scores)).toEqual([
        "Remove every em dash and en dash; use a comma, a colon, or a new sentence",
      ]);
    const linked = {
      ...valid(),
      next_steps: [
        words(199),
        { kind: "note" as const, text: "see www.example.com" },
      ],
    };
    expect(checkProAdvisory(linked, scores)).toEqual([
      "Remove every web address; add no links",
    ]);
  });

  it("keeps the length between the limits", () => {
    const short = {
      ...valid(),
      executive_summary: [words(10)],
      strategic_recommendations: [words(10)],
    };
    expect(checkProAdvisory(short, scores)[0]).toMatch(
      new RegExp(`write at least ${MIN_WORDS}$`),
    );
    const long = { ...valid(), executive_summary: [words(1500)] };
    expect(checkProAdvisory(long, scores)[0]).toMatch(
      new RegExp(`keep it under ${MAX_WORDS}$`),
    );
  });

  it("is the phase's check, run on parsed output", () => {
    const phase = beaconPro.phases[0];
    expect(phase?.check?.(valid(), ctx(null))).toEqual([]);
  });

  it("refuses links and rules in the output schema (AC-9)", () => {
    const withLink = {
      ...valid(),
      next_steps: [{ kind: "link", text: "a", url: "https://x" }],
    };
    expect(proAdvisorySchema.safeParse(withLink).success).toBe(false);
    expect(
      proAdvisorySchema.safeParse({ ...valid(), next_steps: [] }).success,
    ).toBe(false);
  });
});

describe("the advisory prompt (AC-11)", () => {
  it("carries the first name, business facts, scores and flag labels in the fenced block", () => {
    const { instructions, prompt } = proAdvisoryPhase.buildPrompt({
      ...ctx("Ada"),
      scores,
    });
    expect(instructions).toContain("<client_data>");
    expect(instructions).toContain("Never use em dashes");
    const data = prompt.slice(
      prompt.indexOf("<client_data>"),
      prompt.indexOf("</client_data>"),
    );
    expect(data).toContain("First name: Ada");
    expect(data).toContain("Business name: Ada <b>Foods</b>");
    expect(data).toContain(`Overall score: ${scores.total.toFixed(1)}/100`);
    expect(data).toContain("Financial Health:");
    expect(data).toContain(flagLabel("CASH_CRISIS"));
    expect(data).not.toContain("CASH_CRISIS");
    expect(prompt).toContain("write critical_priorities");
  });

  it("says none for a guest's first name, and null sections without flags", () => {
    const calm = scoresOf({
      ...ANSWERS,
      cash_flow: "consistent-surplus",
      profit_margin: "30-pct-plus",
      cash_runway: "6-plus-months",
      founder_dependency: "runs-2-plus-weeks-without-me",
      formal_registration: "fully-registered-and-tax-compliant",
      pricing_power: "some-would-leave-but-still-profitable",
      acquisition_channel: "paid-advertising",
      payment_speed: "31-60-days",
    });
    const { prompt } = proAdvisoryPhase.buildPrompt({
      ...ctx(null),
      scores: calm,
    });
    expect(prompt).toContain("First name: none");
    expect(calm.flags.critical).toEqual([]);
    expect(prompt).toContain("critical_priorities is null");
  });
});

describe("the Pro view and preview (AC-12, AC-13)", () => {
  const view = beaconProView({ scores, content: { advisory: valid() } });

  it("shows the header, bars, flag lists, then the advisory sections in order", () => {
    expect(view.map((b) => [b.kind, b.title])).toEqual([
      ["score_header", "Beacon Pro"],
      ["category_bars", "Your five areas"],
      ["bullets", "Critical flags"],
      ["bullets", "Opportunities"],
      ["rich_section", "Executive Summary"],
      ["rich_section", "Critical Priorities (Next 30 Days)"],
      ["rich_section", "Strategic Recommendations"],
      ["rich_section", "Growth Opportunities"],
      ["rich_section", "Your Next Steps"],
    ]);
  });

  it("leaves out a null section", () => {
    const blocks = beaconProView({
      scores,
      content: { advisory: { ...valid(), growth_opportunities: null } },
    });
    expect(blocks.map((b) => b.title)).not.toContain("Growth Opportunities");
  });

  it("uses plain flag labels", () => {
    const critical = view.find((b) => b.title === "Critical flags");
    expect(critical).toMatchObject({
      items: expect.arrayContaining(["Cash crisis"]),
    });
  });

  it("previews exactly the head of the ready view", () => {
    const preview = beaconProPreview(scores);
    expect(view.slice(0, preview.length)).toEqual(preview);
    expect(beaconPro.toPreview?.(scores)).toEqual(preview);
  });

  it("leaves Stellar and Beacon without a preview", () => {
    expect(tools.filter((t) => t.toPreview).map((t) => t.id)).toEqual([
      "beacon_pro",
    ]);
  });
});
