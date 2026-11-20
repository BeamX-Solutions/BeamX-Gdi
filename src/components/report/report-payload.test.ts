import { describe, expect, it } from "vitest";
import type { ReportStatusPayload } from "@/assistant/report-status";
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
