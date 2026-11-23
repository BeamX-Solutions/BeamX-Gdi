import { describe, expect, it } from "vitest";
import type { ReportStatusPayload } from "@/assistant/report-status";
import { panelPayloads } from "@/components/fixtures/report";
import { getTool } from "@/tools/registry";
import { reportPayloadSchema, type ReportPayload } from "./report-payload";

// Compile time: every payload the server builds is one the client schema describes.
const fits = (payload: ReportStatusPayload): ReportPayload => ({
  ...payload,
  phases: [...payload.phases],
  view: payload.view ? [...payload.view] : undefined,
});

describe("reportPayloadSchema", () => {
  it("parses a ready payload and strips a 409 code", () => {
    const body = {
      status: "failed",
      phases: [{ label: "Writing", done: true }],
      error: { kind: "exhausted", title: "T", message: "M" },
      canRetry: false,
      stale: false,
      code: "attempts_exhausted",
    };
    const parsed = reportPayloadSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("code");
  });

  it("parses every block kind", () => {
    const parsed = reportPayloadSchema.safeParse({
      status: "ready",
      phases: [],
      error: null,
      canRetry: false,
      stale: false,
      view: [
        {
          kind: "score_header",
          title: "S",
          score: 1,
          max: 2,
          verdict: "good",
          summary: "s",
        },
        {
          kind: "category_bars",
          title: "C",
          items: [{ label: "a", score: 1, max: 2 }],
        },
        {
          kind: "advice_list",
          title: "A",
          items: [{ title: "t", priority: "high" }],
        },
        { kind: "text", title: "T", paragraphs: ["p"] },
        { kind: "bullets", title: "B", items: ["i"] },
        {
          kind: "timeline",
          title: "L",
          steps: [{ label: "Week 1", items: ["x"] }],
        },
        {
          kind: "resources",
          title: "R",
          items: [{ title: "r", description: "d", url: null }],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(fits).toBeTypeOf("function");
  });

  it.each([
    [
      "an unknown error kind",
      { error: { kind: "boom", title: "T", message: "M" } },
    ],
    ["an unknown block kind", { view: [{ kind: "chart", title: "X" }] }],
    ["an unknown status", { status: "done" }],
  ])("rejects %s", (_, patch) => {
    const parsed = reportPayloadSchema.safeParse({
      status: "ready",
      phases: [],
      error: null,
      canRetry: false,
      stale: false,
      ...patch,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("reportPayloadSchema and rich sections (spec 0010)", () => {
  it("parses the Beacon ready payload with every rich part kind", () => {
    const parsed = reportPayloadSchema.safeParse(panelPayloads.beaconReady);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.view).toEqual(panelPayloads.beaconReady.view);
  });

  it("parses a real Beacon view, as the server builds it", () => {
    const beacon = getTool("beacon");
    if (!beacon.ok) throw new Error("beacon is not registered");
    const answers = Object.fromEntries(
      beacon.value.questions.map((q) => [
        q.id,
        q.kind === "single" ? (q.options.at(-1)?.value ?? "") : "Ada Foods",
      ]),
    );
    const scored = beacon.value.score(answers);
    if (!scored.ok) throw new Error("incomplete");
    const scores = scored.value as { readonly advisory: unknown };
    const view = beacon.value.toView({
      scores: scored.value,
      content: { advisory: scores.advisory },
      answers,
    });
    expect(
      reportPayloadSchema.safeParse({
        status: "ready",
        phases: [],
        error: null,
        canRetry: false,
        stale: false,
        view,
      }).success,
    ).toBe(true);
  });

  it("refuses an unknown part kind", () => {
    expect(
      reportPayloadSchema.safeParse({
        status: "ready",
        phases: [],
        error: null,
        canRetry: false,
        stale: false,
        view: [
          {
            kind: "rich_section",
            title: "S",
            parts: [{ kind: "html", text: "x" }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
