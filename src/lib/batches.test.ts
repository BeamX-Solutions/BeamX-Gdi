import { describe, expect, it, vi } from "vitest";
import { runInBatches } from "./batches";

// Spec 0009, AC-14: batches of a fixed size, stopping when one comes back short or the
// time budget is spent, with counts and totals summed.

describe("runInBatches", () => {
  it("runs until a batch comes back short, summing counts and totals", async () => {
    const sizes = [50, 50, 7];
    const batch = vi.fn(async (limit: number) => {
      expect(limit).toBe(50);
      const count = sizes.shift() ?? 0;
      return { count, total: count * 2 };
    });
    const summary = await runInBatches(batch, {
      batchSize: 50,
      budgetMs: 120_000,
      now: () => 0,
    });
    expect(summary).toEqual({
      count: 107,
      total: 214,
      batches: 3,
      complete: true,
    });
  });

  it("is complete after one empty batch when there is nothing to do", async () => {
    const summary = await runInBatches(async () => ({ count: 0, total: 0 }), {
      batchSize: 50,
      budgetMs: 120_000,
      now: () => 0,
    });
    expect(summary).toEqual({ count: 0, total: 0, batches: 1, complete: true });
  });

  it("stops when the budget is spent and leaves the rest for next time", async () => {
    let clock = 0;
    const batch = vi.fn(async () => {
      clock += 50_000; // each full batch takes 50 seconds
      return { count: 50, total: 0 };
    });
    const summary = await runInBatches(batch, {
      batchSize: 50,
      budgetMs: 120_000,
      now: () => clock,
    });
    // 0s, 50s and 100s start a batch; at 150s the budget is spent.
    expect(batch).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({
      count: 150,
      total: 0,
      batches: 3,
      complete: false,
    });
  });
});
