import { describe, expect, it } from "vitest";
import { makeRegistry } from "@/tools/_kit/registry";
import { sampleTool } from "@/tools/test-tools/sample";
import {
  buildRunState,
  COMPLETED_IN_NOTE,
  type RunStateInput,
} from "./run-state";

// Spec 0006, "Run state note" (AC-8, AC-12): pure, built fresh each AI turn.

const { getTool } = makeRegistry([sampleTool]);

const base: RunStateInput = { getTool, active: null, paused: [], runs: [] };

describe("buildRunState", () => {
  it("says when no run is active, inside a run_state block", () => {
    expect(buildRunState(base)).toBe(
      "<run_state>\nActive run: none.\n</run_state>",
    );
  });

  it("gives the active run's progress and the open question with its values", () => {
    const note = buildRunState({
      ...base,
      active: {
        runId: "r1",
        toolId: "sample",
        answers: { stage: "selling" },
        latestShownId: "monthly_sales",
      },
    });
    expect(note).toContain(
      "Active run: Sample (run r1), 1 of 5 questions answered.",
    );
    expect(note).toContain(
      'Open question (id monthly_sales): "How much do you sell each month?". Answer with an amount in naira, as a plain number from 0 up to 1000000000.',
    );
    expect(note).toContain('- stage: "Where are you?" (answered)');
    // Hidden questions are not listed.
    expect(note).not.toContain("best_month");
  });

  it("falls back to the next question when the shown one is hidden", () => {
    const note = buildRunState({
      ...base,
      active: {
        runId: "r1",
        toolId: "sample",
        answers: { stage: "idea" },
        latestShownId: "monthly_sales",
      },
    });
    expect(note).toContain(
      'Open question (id channels): "Where do you sell?". Answer with a list of 1 to 2 of: "whatsapp" (WhatsApp), "instagram" (Instagram), "market" (Market stall).',
    );
  });

  it("lists paused runs, the latest completed runs and free messages", () => {
    const runs = Array.from({ length: COMPLETED_IN_NOTE + 2 }, (_, i) => ({
      runId: `c${i}`,
      toolId: "sample",
      status: "completed",
      reportStatus: i === 0 ? "ready" : null,
    }));
    const note = buildRunState({
      ...base,
      paused: [{ runId: "p1", toolId: "sample" }],
      runs: [
        {
          runId: "x",
          toolId: "sample",
          status: "abandoned",
          reportStatus: null,
        },
        ...runs,
      ],
      freeMessagesLeft: 3,
    });
    expect(note).toContain("Paused runs:\n- Sample (run p1)");
    expect(note).toContain("- Sample (run c0), report ready");
    expect(note).toContain("- Sample (run c1), report not started");
    expect(note).not.toContain(`run c${COMPLETED_IN_NOTE}`);
    expect(note).not.toContain("run x");
    expect(note).toContain("Free messages left today: 3.");
  });
});
