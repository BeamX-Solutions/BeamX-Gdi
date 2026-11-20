import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ReportStatus } from "@/db/queries/reports";
import { err, ok } from "@/lib/result";
import { threePhaseTool } from "@/tools/test-tools/three-phase";
import type { ToolReader } from "@/tools/registry";
import { buildStatus, buildView } from "./report-status";

// Spec 0005, AC-10 and AC-13: the pure status payload and the report view.

const row = (over: Partial<ReportStatus> = {}): ReportStatus => ({
  toolId: "three-phase",
  toolVersion: "1",
  status: "generating",
  attempts: 1,
  updatedAt: "2026-11-20 10:00:00+00",
  error: null,
  phaseKeys: [],
  hasHold: true,
  stale: false,
  ...over,
});

describe("buildStatus (AC-10)", () => {
  it("lists the current module's phases with done flags from the saved keys", () => {
    const body = buildStatus(row({ phaseKeys: ["one"] }), threePhaseTool);
    expect(body.phases).toEqual([
      { label: "Step one", done: true },
      { label: "Step two", done: false },
      { label: "Step three", done: false },
    ]);
    expect(body.error).toBeNull();
    expect(body.canRetry).toBe(false);
    expect(body.view).toBeUndefined();
  });

  it("offers a retry on a failed report with attempts and a hold left", () => {
    const body = buildStatus(
      row({
        status: "failed",
        error: { kind: "provider_overloaded", message: "x" },
      }),
      threePhaseTool,
    );
    expect(body.canRetry).toBe(true);
    expect(body.error).toEqual({
      kind: "provider_overloaded",
      title: "That did not work",
      message: "Something went wrong on our side. Your answers are safe.",
    });
  });

  it("never shows the stored message raw", () => {
    const body = buildStatus(
      row({ status: "failed", error: { kind: "unknown", message: "secret" } }),
      threePhaseTool,
    );
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("shows exhausted and no retry once the last attempt failed", () => {
    const body = buildStatus(
      row({
        status: "failed",
        attempts: 3,
        hasHold: false,
        error: { kind: "timeout", message: "x" },
      }),
      threePhaseTool,
    );
    expect(body.error?.kind).toBe("exhausted");
    expect(body.canRetry).toBe(false);
  });

  it("shows no_credit_hold when the hold is gone with attempts left", () => {
    const body = buildStatus(
      row({
        status: "failed",
        hasHold: false,
        error: { kind: "timeout", message: "x" },
      }),
      threePhaseTool,
    );
    expect(body.error?.kind).toBe("no_credit_hold");
    expect(body.canRetry).toBe(false);
  });

  it("offers a retry on a stale report with attempts left, not on the last one", () => {
    expect(buildStatus(row({ stale: true }), threePhaseTool)).toMatchObject({
      stale: true,
      canRetry: true,
      error: null,
    });
    expect(
      buildStatus(row({ stale: true, attempts: 3 }), threePhaseTool).canRetry,
    ).toBe(false);
  });

  it("shows version_changed with no phases and no retry for an old version", () => {
    const body = buildStatus(
      row({ toolVersion: "0", status: "failed" }),
      threePhaseTool,
    );
    expect(body.phases).toEqual([]);
    expect(body.error?.kind).toBe("version_changed");
    expect(body.canRetry).toBe(false);
  });

  it("treats a tool gone from the registry as version_changed", () => {
    expect(buildStatus(row(), null).error?.kind).toBe("version_changed");
  });

  it("includes the view only when ready and readable", () => {
    const blocks = [{ kind: "text", title: "T", paragraphs: ["p"] }] as const;
    const ready = buildStatus(row({ status: "ready" }), null, ok(blocks));
    expect(ready.view).toEqual(blocks);
    expect(ready.error).toBeNull();

    const notLoaded = buildStatus(row({ status: "ready" }), threePhaseTool);
    expect(notLoaded.view).toBeUndefined();
    expect(notLoaded.error).toBeNull();

    const bad = buildStatus(
      row({ status: "ready" }),
      threePhaseTool,
      err({ code: "stored_data_invalid" }),
    );
    expect(bad.view).toBeUndefined();
    expect(bad.error?.kind).toBe("stored_data_invalid");
    expect(bad.canRetry).toBe(false);
  });
});

describe("buildView (AC-13)", () => {
  const content = {
    one: { text: "a" },
    two: { text: "b" },
    three: { text: "c" },
  };
  const stored = {
    run: { scores: {} },
    answers: [{ questionId: "goal", value: "grow" }],
    report: { content },
  };

  it("draws the blocks from parsed answers, scores and content", () => {
    expect(buildView(threePhaseTool, stored)).toEqual(
      ok([{ kind: "bullets", title: "Steps", items: ["a", "b", "c"] }]),
    );
  });

  it("returns stored_data_invalid for corrupt content, answers or scores", () => {
    const invalid = { ok: false, error: { code: "stored_data_invalid" } };
    expect(
      buildView(threePhaseTool, {
        ...stored,
        report: { content: { one: 1 } },
      }),
    ).toEqual(invalid);
    expect(
      buildView(threePhaseTool, {
        ...stored,
        answers: [{ questionId: "goal", value: "nope" }],
      }),
    ).toEqual(invalid);
    const strictScores: ToolReader = {
      ...threePhaseTool,
      scoresSchema: z.object({ total: z.number() }),
    };
    expect(buildView(strictScores, stored)).toEqual(invalid);
  });

  it("returns stored_data_invalid when toView throws", () => {
    const throwing: ToolReader = {
      ...threePhaseTool,
      toView: () => {
        throw new Error("bad");
      },
    };
    expect(buildView(throwing, stored).ok).toBe(false);
  });
});
