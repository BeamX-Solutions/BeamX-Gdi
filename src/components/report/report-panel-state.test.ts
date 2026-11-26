import { describe, expect, it } from "vitest";
import { reportErrorCopy } from "@/components/feedback/error-copy";
import {
  asRetrying,
  panelView,
  pollDelayMs,
  shouldPoll,
  skeletonSteps,
} from "./report-panel-state";
import type { ReportPayload } from "./report-payload";

const base: ReportPayload = {
  status: "generating",
  phases: [
    { label: "Scoring", done: true },
    { label: "Writing", done: false },
    { label: "Checking", done: false },
  ],
  error: null,
  canRetry: false,
  stale: false,
};

const loaded = (patch: Partial<ReportPayload>) =>
  panelView({ kind: "loaded", payload: { ...base, ...patch } });

const withError = (kind: keyof typeof reportErrorCopy) => ({
  kind,
  ...reportErrorCopy[kind],
});

describe("pollDelayMs", () => {
  it("polls every 2s for the first 30s, then every 5s", () => {
    expect(pollDelayMs(0)).toBe(2_000);
    expect(pollDelayMs(29_999)).toBe(2_000);
    expect(pollDelayMs(30_000)).toBe(5_000);
    expect(pollDelayMs(300_000)).toBe(5_000);
  });
});

describe("shouldPoll", () => {
  it.each([
    ["pending", false, true],
    ["generating", false, true],
    ["generating", true, false],
    ["ready", false, false],
    ["failed", false, false],
  ] as const)("%s, stale %s → %s", (status, stale, expected) => {
    expect(shouldPoll({ ...base, status, stale })).toBe(expected);
  });
});

describe("skeletonSteps", () => {
  it("ticks done phases, marks the first open one active, the rest waiting", () => {
    expect(skeletonSteps(base.phases).map((s) => s.state)).toEqual([
      "done",
      "active",
      "pending",
    ]);
  });

  it("has no active step when every phase is done", () => {
    expect(
      skeletonSteps(base.phases.map((p) => ({ ...p, done: true }))).map(
        (s) => s.state,
      ),
    ).toEqual(["done", "done", "done"]);
  });
});

describe("panelView", () => {
  it("shows the skeleton while generating", () => {
    expect(loaded({})).toMatchObject({ kind: "generating" });
    expect(loaded({ status: "pending" })).toMatchObject({ kind: "generating" });
  });

  it("carries a preview above the skeleton and error cards (spec 0011)", () => {
    const preview = [
      { kind: "text" as const, title: "Score", paragraphs: ["7"] },
    ];
    expect(loaded({ preview })).toMatchObject({ kind: "generating", preview });
    expect(
      loaded({
        status: "failed",
        canRetry: true,
        error: withError("timeout"),
        preview,
      }),
    ).toMatchObject({ kind: "retry", preview });
    expect(loaded({ preview: [] })).not.toHaveProperty("preview");
    expect(loaded({})).not.toHaveProperty("preview");
  });

  it("shows an empty skeleton while loading, never a blank", () => {
    expect(panelView({ kind: "loading" })).toEqual({
      kind: "generating",
      steps: [],
    });
  });

  it("offers Retry for a retryable failure", () => {
    expect(
      loaded({ status: "failed", canRetry: true, error: withError("timeout") }),
    ).toEqual({
      kind: "retry",
      cardKind: "ai_error",
      ...reportErrorCopy.timeout,
    });
  });

  it("keeps the gauge icon for a spend cap failure", () => {
    expect(
      loaded({
        status: "failed",
        canRetry: true,
        error: withError("spend_cap"),
      }),
    ).toMatchObject({ kind: "retry", cardKind: "spend_cap" });
  });

  it("offers Retry for a stale report, even on the last attempt", () => {
    expect(loaded({ stale: true, canRetry: false })).toEqual({
      kind: "retry",
      cardKind: "ai_error",
      ...reportErrorCopy.timeout,
    });
  });

  it.each(["exhausted", "no_credit_hold", "version_changed"] as const)(
    "shows a final card with no Retry for %s",
    (kind) => {
      expect(
        loaded({ status: "failed", canRetry: false, error: withError(kind) }),
      ).toEqual({
        kind: "final",
        cardKind: "ai_error",
        ...reportErrorCopy[kind],
      });
    },
  );

  it("draws the report when ready", () => {
    const view = [{ kind: "text" as const, title: "Hi", paragraphs: ["x"] }];
    expect(loaded({ status: "ready", view })).toEqual({
      kind: "ready",
      blocks: view,
    });
  });

  it("shows stored_data_invalid as final when a ready report has no view", () => {
    expect(
      loaded({ status: "ready", error: withError("stored_data_invalid") }),
    ).toMatchObject({
      kind: "final",
      title: reportErrorCopy.stored_data_invalid.title,
    });
    expect(loaded({ status: "ready" })).toMatchObject({ kind: "final" });
  });

  it("offers Retry when offline or when the server answer is unusable", () => {
    expect(panelView({ kind: "offline" })).toMatchObject({
      kind: "retry",
      cardKind: "network",
    });
    expect(panelView({ kind: "unavailable" })).toMatchObject({
      kind: "retry",
      cardKind: "ai_error",
    });
  });
});

describe("asRetrying", () => {
  it("turns a failed report into a generating one, keeping its phases", () => {
    const next = asRetrying({
      kind: "loaded",
      payload: {
        ...base,
        status: "failed",
        canRetry: true,
        error: withError("unknown"),
      },
    });
    expect(panelView(next)).toEqual({
      kind: "generating",
      steps: skeletonSteps(base.phases),
    });
  });

  it("goes back to loading from offline", () => {
    expect(asRetrying({ kind: "offline" })).toEqual({ kind: "loading" });
  });
});
