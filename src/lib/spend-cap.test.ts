import { describe, expect, it, vi } from "vitest";
import type { LimitStore } from "./limits";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { checkSpendCap, spendGuard } = await import("./spend-cap");

/** An in memory store with real NX rules, so parallel crossings can be tested. */
const memoryStore = () => {
  const values = new Map<string, number | string>();
  const store: LimitStore = {
    read: async (_name, key) => Number(values.get(key) ?? 0),
    tryRead: async (_name, key) => Number(values.get(key) ?? 0),
    count: async (_name, key) => {
      values.set(key, Number(values.get(key) ?? 0) + 1);
    },
    take: async (_name, key) => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    },
    giveBack: async (_name, key) => {
      values.set(key, Number(values.get(key) ?? 0) - 1);
    },
    addFloat: async (_name, key, by) => {
      // Yield first, so two parallel calls interleave like real requests.
      await Promise.resolve();
      const total = Number(values.get(key) ?? 0) + by;
      values.set(key, total);
      return total;
    },
    setOnce: async (_name, key, value) => {
      await Promise.resolve();
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    burst: async () => true,
  };
  return { store, values };
};

const NOW = new Date("2026-11-22T10:00:00Z");
const TODAY = "spend:2026-11-22";
const TRIPPED = "spend:tripped:2026-11-22";

const guard = (capUsd = 20) => {
  const mem = memoryStore();
  const log = vi.fn();
  const g = spendGuard({ store: mem.store, capUsd, now: () => NOW, log });
  return { ...mem, log, g };
};

describe("addSpend (AC-1, AC-3)", () => {
  it("adds up the cost of every call in the Lagos day's total", async () => {
    const { g, values } = guard();
    await g.addSpend(0.25);
    await g.addSpend(1.5);
    await g.addSpend(0.004);
    expect(values.get(TODAY)).toBeCloseTo(1.754);
  });

  it("adds nothing for a call with no cost", async () => {
    const { g, values } = guard();
    await g.addSpend(0);
    await g.addSpend(Number.NaN);
    expect(values.has(TODAY)).toBe(false);
  });

  it("sets the tripped marker and logs once, even when two calls cross together", async () => {
    const { g, values, log } = guard(1);
    await g.addSpend(0.9);
    await Promise.all([g.addSpend(0.2), g.addSpend(0.3)]);
    await g.addSpend(0.1);
    expect(values.get(TRIPPED)).toBe(NOW.toISOString());
    const tripped = log.mock.calls.filter(([e]) => e === "spend_cap_tripped");
    expect(tripped).toHaveLength(1);
  });

  it("does not trip below the cap", async () => {
    const { g, values, log } = guard(1);
    await g.addSpend(0.99);
    expect(values.has(TRIPPED)).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("guestSpendCap (AC-2)", () => {
  it("allows below the cap and refuses at or over it", async () => {
    const { g } = guard(1);
    expect((await g.guestSpendCap()).ok).toBe(true);
    await g.addSpend(1);
    expect(await g.guestSpendCap()).toEqual({
      ok: false,
      error: { code: "spend_cap" },
    });
  });
});

describe("withSpend (AC-1)", () => {
  it("adds the cost only when the ai_usage row was recorded", async () => {
    const { g, values } = guard();
    type In = { costUsd: string };
    const recorded = g.withSpend<In, { status: "recorded"; id: string }>(
      async () => ({ status: "recorded", id: "x" }),
    );
    const duplicate = g.withSpend<In, { status: "duplicate" }>(async () => ({
      status: "duplicate",
    }));
    expect(await recorded({ costUsd: "0.500000" })).toEqual({
      status: "recorded",
      id: "x",
    });
    await duplicate({ costUsd: "9" });
    expect(values.get(TODAY)).toBe(0.5);
  });

  it("adds nothing when the insert throws, and lets the error through", async () => {
    const { g, values } = guard();
    const failing = g.withSpend<{ costUsd: number }, { status: "recorded" }>(
      async () => {
        throw new Error("db down");
      },
    );
    await expect(failing({ costUsd: 1 })).rejects.toThrow("db down");
    expect(values.size).toBe(0);
  });
});

describe("checkSpendCap (AC-11)", () => {
  it("never blocks the report runner", async () => {
    expect((await checkSpendCap("u1")).ok).toBe(true);
  });
});
