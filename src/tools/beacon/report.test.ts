/**
 * Spec 0010, AC-7 and AC-8: the advisory prompt and the check that holds the rewrite's
 * structure, links and numbers fixed.
 */
import { describe, expect, it } from "vitest";
import type { Answers, PhaseContext } from "../_contract";
import { beacon } from ".";
import type { Advisory, Part, Section } from "./advisory";
import { advisoryPhase, checkAdvisory, MAX_ISSUES } from "./report";
import { scoreBeacon, type BeaconScores } from "./scoring";

/** A complete, mid range answer set with critical flags and an industry insight. */
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

const scored = scoreBeacon(ANSWERS);
if (!scored.ok) throw new Error("fixture answers are incomplete");
const scores: BeaconScores = scored.value;
const rule = scores.advisory;

/** A deep copy with one section's parts changed. */
const editSection = (
  index: number,
  edit: (section: Section) => Section,
): Advisory => ({
  sections: rule.sections.map((s, i) => (i === index ? edit(s) : s)),
});

const editPart = (
  sectionIndex: number,
  partIndex: number,
  edit: (part: Part) => Part,
): Advisory =>
  editSection(sectionIndex, (s) => ({
    ...s,
    parts: s.parts.map((p, j) => (j === partIndex ? edit(p) : p)),
  }));

/** The first section and part index whose part matches. */
const find = (match: (p: Part) => boolean): readonly [number, number] => {
  for (const [i, s] of rule.sections.entries())
    for (const [j, p] of s.parts.entries()) if (match(p)) return [i, j];
  throw new Error("no such part");
};

const ctx = (firstName: string | null): PhaseContext => ({
  answers: ANSWERS,
  scores,
  earlier: {},
  client: { firstName },
});

describe("advisory check (AC-8)", () => {
  it("accepts an unchanged copy", () => {
    expect(checkAdvisory(rule, structuredClone(rule))).toEqual([]);
  });

  it("accepts rewritten text that keeps the numbers", () => {
    const out = {
      sections: rule.sections.map((s) => ({
        ...s,
        parts: s.parts.map((p) =>
          p.kind === "note" ? { ...p, text: `${p.text} (reworded)` } : p,
        ),
      })),
    };
    expect(checkAdvisory(rule, out)).toEqual([]);
  });

  it("rejects a changed heading", () => {
    const out = editSection(0, (s) => ({ ...s, heading: "Summary" }));
    expect(checkAdvisory(rule, out)).toEqual([
      'Section 1 ("Executive Summary"): the heading changed',
    ]);
  });

  it("rejects a dropped bullet", () => {
    const [i, j] = find((p) => p.kind === "bullets" && p.items.length > 1);
    const out = editPart(i, j, (p) =>
      p.kind === "bullets" ? { ...p, items: p.items.slice(1) } : p,
    );
    expect(checkAdvisory(rule, out).join("\n")).toMatch(
      /should have \d+ items/,
    );
  });

  it("rejects a lead moved to another item", () => {
    const [i, j] = find(
      (p) =>
        p.kind === "bullets" &&
        p.items[0]?.lead === undefined &&
        p.items[1]?.lead !== undefined,
    );
    const out = editPart(i, j, (p) => {
      if (p.kind !== "bullets") return p;
      const [first, second, ...rest] = p.items;
      if (!first || !second) return p;
      return {
        ...p,
        items: [
          { lead: second.lead ?? "", text: first.text },
          { text: second.text },
          ...rest,
        ],
      };
    });
    const issues = checkAdvisory(rule, out);
    expect(issues).toContain(
      `Section ${i + 1} ("${rule.sections[i]?.heading}"), part ${j + 1}: item 1's bold lead changed`,
    );
  });

  it("rejects a changed link", () => {
    const [i, j] = find((p) => p.kind === "link");
    const out = editPart(i, j, (p) =>
      p.kind === "link" ? { ...p, url: "https://evil.example/book" } : p,
    );
    expect(checkAdvisory(rule, out).join("\n")).toMatch(/the link changed/);
    expect(checkAdvisory(rule, out).join("\n")).toMatch(
      /Remove the web address https:\/\/evil\.example\/book/,
    );
  });

  it("rejects a www address added to a paragraph", () => {
    const [i, j] = find((p) => p.kind === "paragraph");
    const out = editPart(i, j, (p) =>
      p.kind === "paragraph" ? { ...p, text: `${p.text} See www.x.io` } : p,
    );
    expect(checkAdvisory(rule, out)).toEqual([
      "Remove the web address www.x.io; add no links",
    ]);
  });

  /** A one paragraph advisory, so each number appears exactly once. */
  const single = (text: string, lead?: string): Advisory => ({
    sections: [
      {
        heading: "Summary",
        parts: [
          lead === undefined
            ? { kind: "paragraph", text }
            : { kind: "paragraph", lead, text },
        ],
      },
    ],
  });

  it('rejects "30 days" rewritten as "a month"', () => {
    expect(
      checkAdvisory(
        single("Act within 30 days."),
        single("Act within a month."),
      ),
    ).toEqual([
      'Section 1 ("Summary"): the number 30 is missing; keep every number as digits',
    ]);
  });

  it("rejects 100.0 written as 100", () => {
    expect(
      checkAdvisory(
        single("100.0/100", "Overall Score:"),
        single("100/100", "Overall Score:"),
      ),
    ).toEqual([
      'Section 1 ("Summary"): the number 100.0 is missing; keep every number as digits',
    ]);
  });

  it("matches numbers across the whole section, not part by part", () => {
    const rule = single("Within 30 days, then 30 more.");
    expect(
      checkAdvisory(rule, single("Within a month, then 30 more.")),
    ).toEqual([]);
  });

  it("rejects a different number of sections", () => {
    expect(checkAdvisory(rule, { sections: rule.sections.slice(1) })).toEqual([
      `The advisory should have ${rule.sections.length} sections, not ${rule.sections.length - 1}`,
    ]);
  });

  it(`caps the issues at ${MAX_ISSUES}`, () => {
    const out = {
      sections: rule.sections.map((s) => ({
        ...s,
        // Every part but a rule turns into a rule: one kind issue per part.
        parts: s.parts.map((p): Part =>
          p.kind === "rule" ? p : { kind: "rule" },
        ),
      })),
    };
    expect(checkAdvisory(rule, out)).toHaveLength(MAX_ISSUES);
  });

  it("is what the phase runs, against the stored rule advisory", () => {
    const phase = beacon.phases[0];
    expect(phase?.check?.(structuredClone(rule), ctx(null))).toEqual([]);
    const broken = editSection(0, (s) => ({ ...s, heading: "Summary" }));
    expect(phase?.check?.(broken, ctx(null))).toHaveLength(1);
  });
});

describe("advisory prompt (AC-7)", () => {
  const promptFor = (firstName: string | null) => {
    const phase = beacon.phases[0];
    if (!phase) throw new Error("no phase");
    return phase.buildPrompt(ctx(firstName));
  };

  it("has the spec's phase settings", () => {
    expect(advisoryPhase).toMatchObject({
      key: "advisory",
      label: "Writing your advice",
      modelRole: "report",
      timeoutMs: 90_000,
    });
  });

  it("puts every client value inside the fenced data block, as labels", () => {
    const { prompt, instructions } = promptFor("Ada");
    const fenced = prompt.slice(
      prompt.indexOf("<client_data>"),
      prompt.indexOf("</client_data>"),
    );
    for (const line of [
      "Business name: Ada <b>Foods</b>",
      "First name: Ada",
      "Stage: Building Blocks",
      `Score: ${scores.total.toFixed(1)}/100`,
      "Industry: Food & Beverage",
      "Years in business: 3-5 years",
      "Primary challenge: Managing cash flow/getting paid",
    ])
      expect(fenced).toContain(line);
    const json = fenced.slice(fenced.indexOf("Advisory (JSON):\n") + 17);
    expect(JSON.parse(json)).toEqual(rule);
    expect(fenced).not.toContain("food-and-beverage");
    expect(instructions).toContain("<client_data>");
  });

  it('gives a guest the first name "none"', () => {
    expect(promptFor(null).prompt).toContain("First name: none");
  });
});
