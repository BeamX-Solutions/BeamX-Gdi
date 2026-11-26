/**
 * Spec 0010, AC-9 and AC-10, kept for the frozen v1 reader (spec 0011, AC-3): stored v1
 * reports draw in their original order, with findings weakest first, critical ones
 * marked high, the booking link moved to resources; and the shared verdict thresholds.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ReportBlock } from "../_contract";
import { bands } from "./categories";
import { fixtureAnswersSchema, toAnswers } from "./parity-fixtures";
import { scoreBeacon } from "./scoring";
import { beaconV1Reader } from "./v1-reader";
import { bandLines, bandVerdict, percentageVerdict } from "./verdicts";

const BOOKING_URL = "https://calendly.com/beamxsolutions";

const cases = z
  .object({
    cases: z.array(
      z.object({ name: z.string(), answers: fixtureAnswersSchema }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../../../fixtures/parity/beacon/reports.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ),
  ).cases;

/** A stored v1 advisory: four sections, the last ending with the booking link. */
const advisory = {
  sections: [
    {
      heading: "Executive Summary",
      parts: [{ kind: "paragraph", text: "Summary." }],
    },
    {
      heading: "Strategic Recommendations",
      parts: [{ kind: "subheading", text: "Cash" }],
    },
    {
      heading: "Growth Opportunities",
      parts: [{ kind: "bullets", items: [{ text: "Raise prices." }] }],
    },
    {
      heading: "Your Next Steps",
      parts: [
        { kind: "paragraph", text: "Start today." },
        { kind: "link", text: "Book a call", url: BOOKING_URL },
      ],
    },
  ],
};

/** A v1 view of a fixture case, as the v1 reader draws stored data. */
const viewOf = (name: string): readonly ReportBlock[] => {
  const found = cases.find((c) => c.name === name);
  if (!found) throw new Error(`no case ${name}`);
  const answers = toAnswers(found.answers);
  const scored = scoreBeacon(answers);
  if (!scored.ok) throw new Error("incomplete");
  return beaconV1Reader.toView({
    scores: { ...scored.value, advisory },
    content: { advisory },
    answers,
  });
};

const blockOf = <K extends ReportBlock["kind"]>(
  blocks: readonly ReportBlock[],
  kind: K,
): Extract<ReportBlock, { kind: K }> => {
  const block = blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`no ${kind} block`);
  return block as Extract<ReportBlock, { kind: K }>;
};

describe("Beacon v1 view (spec 0010, AC-9)", () => {
  it("draws the all best case in the original order", () => {
    const blocks = viewOf("all-best");
    expect(blocks.map((b) => b.kind)).toEqual([
      "score_header",
      "category_bars",
      "advice_list",
      "rich_section",
      "rich_section",
      "rich_section",
      "rich_section",
      "resources",
    ]);
    expect(blocks[0]).toEqual({
      kind: "score_header",
      title: "Scale-Ready",
      score: 100,
      max: 100,
      verdict: "good",
      summary: bandLines.scale_ready,
    });
    expect(blockOf(blocks, "category_bars")).toMatchObject({
      title: "Your five areas",
      items: [
        { label: "Financial Health (A)", score: 20, max: 20, verdict: "good" },
        { label: "Customer Strength (A)" },
        { label: "Operational Maturity (A)" },
        { label: "Financial Intelligence (A)" },
        { label: "Growth & Resilience (A)" },
      ],
    });
  });

  it("draws the all worst case with critical findings marked high", () => {
    const blocks = viewOf("all-worst");
    expect(blockOf(blocks, "score_header")).toMatchObject({
      title: "Red Alert",
      verdict: "risk",
      summary: bandLines.red_alert,
    });
    const findings = blockOf(blocks, "advice_list");
    expect(findings.title).toBe("What we found");
    expect(findings.items).toContainEqual({
      title: "Less than 30 days cash runway",
      detail: "Financial Health",
      priority: "high",
    });
    expect(findings.items.some((i) => i.title.startsWith("CRITICAL"))).toBe(
      false,
    );
  });

  it("moves the booking link to resources and out of the sections", () => {
    const blocks = viewOf("all-worst");
    expect(blockOf(blocks, "resources")).toEqual({
      kind: "resources",
      title: "Talk to BeamX",
      items: [
        {
          title: "Book a call",
          description: "Book a free 30-minute strategy call",
          url: BOOKING_URL,
        },
      ],
    });
    expect(
      JSON.stringify(blocks.filter((b) => b.kind === "rich_section")),
    ).not.toContain(BOOKING_URL);
  });

  it("orders findings by category percentage, weakest first", () => {
    const blocks = viewOf("pain-Too busy/overwhelmed");
    const order = blockOf(blocks, "advice_list").items.map((i) => i.detail);
    const bars = blockOf(blocks, "category_bars").items;
    const pct = (name: string | undefined) =>
      bars.find((b) => b.label.startsWith(`${name} (`))?.score ?? 0;
    const scores = order.map(pct);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});

describe("verdicts (spec 0010, AC-10)", () => {
  it("maps each band", () => {
    expect(bands.map(bandVerdict)).toEqual([
      "good",
      "good",
      "caution",
      "risk",
      "risk",
    ]);
  });

  it("maps category percentages at the thresholds", () => {
    expect([100, 70, 69.9, 50, 49.9, 0].map(percentageVerdict)).toEqual([
      "good",
      "good",
      "caution",
      "caution",
      "risk",
      "risk",
    ]);
  });
});
