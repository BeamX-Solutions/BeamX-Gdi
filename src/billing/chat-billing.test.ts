import { describe, expect, it, vi } from "vitest";
import type { LimitStore } from "@/lib/limits";
import {
  accountOpener,
  billingKeys,
  chatSettleAmount,
  freeChat,
  planChat,
} from "./chat-billing";
import { billingConfig } from "./config";

// Spec 0004, AC-9, AC-10, AC-11: the free allowance, the settle amount, and the guest
// grant IP cap.

/** A store where every call allows (like `openLimitStore`, without loading env). */
const openLimitStore: LimitStore = {
  read: async () => 0,
  tryRead: async () => 0,
  count: async () => {},
  take: async () => null,
  giveBack: async () => {},
  addFloat: async () => null,
  setOnce: async () => false,
  burst: async () => true,
};

/** 23:30 UTC on 1 March is already 2 March in Lagos (UTC+1). */
const LATE = new Date("2026-03-01T23:30:00Z");

const memoryStore = () => {
  const values = new Map<string, number | string>();
  const store: LimitStore = {
    ...openLimitStore,
    read: async (_n, key) => Number(values.get(key) ?? 0),
    tryRead: async (_n, key) => Number(values.get(key) ?? 0),
    count: async (_n, key) => {
      values.set(key, Number(values.get(key) ?? 0) + 1);
    },
    setOnce: async (_n, key, value) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
  };
  return { store, values };
};

describe("planChat (AC-9)", () => {
  it("is free while today's count is under the allowance", () => {
    expect(planChat(0, 5)).toEqual({ kind: "free", left: 4, last: false });
    expect(planChat(3, 5)).toEqual({ kind: "free", left: 1, last: false });
  });

  it("marks the turn that uses the last free message", () => {
    expect(planChat(4, 5)).toEqual({ kind: "free", left: 0, last: true });
  });

  it("is paid once the allowance is used", () => {
    expect(planChat(5, 5)).toEqual({ kind: "paid" });
    expect(planChat(9, 5)).toEqual({ kind: "paid" });
  });

  it("is paid when Redis could not say (fails closed)", () => {
    expect(planChat(null, 5)).toEqual({ kind: "paid" });
  });

  it("is always paid with no allowance", () => {
    expect(planChat(0, 0)).toEqual({ kind: "paid" });
  });
});

describe("chatSettleAmount (AC-10)", () => {
  // $0.004 × 1700 × 3 ÷ 100 = 0.204 credits → 1.
  it("charges the real cost on a finished reply, at least 1", () => {
    expect(chatSettleAmount({ kind: "completed" }, 0.004, billingConfig)).toBe(
      1,
    );
  });

  it("caps a finished reply at the ceiling", () => {
    expect(chatSettleAmount({ kind: "completed" }, 5, billingConfig)).toBe(
      billingConfig.chat.ceilingCredits,
    );
  });

  it("charges the minimum when a finished reply reports no usage", () => {
    expect(chatSettleAmount({ kind: "completed" }, null, billingConfig)).toBe(
      1,
    );
  });

  it("charges nothing on an AI error", () => {
    expect(chatSettleAmount({ kind: "failed" }, 0.05, billingConfig)).toBe(0);
  });

  it("charges nothing on a disconnect before any output (resumable streams off)", () => {
    expect(
      chatSettleAmount(
        { kind: "stopped", receivedOutput: false },
        0.05,
        billingConfig,
      ),
    ).toBe(0);
  });

  it("charges the cost so far on a disconnect after output, 1 when unknown", () => {
    // $0.05 × 1700 × 3 ÷ 100 = 2.55 → 3.
    expect(
      chatSettleAmount(
        { kind: "stopped", receivedOutput: true },
        0.05,
        billingConfig,
      ),
    ).toBe(3);
    expect(
      chatSettleAmount(
        { kind: "stopped", receivedOutput: true },
        null,
        billingConfig,
      ),
    ).toBe(1);
  });
});

describe("freeChat counters (AC-9)", () => {
  it("counts under the Lagos day key and reads it back", async () => {
    const { store, values } = memoryStore();
    const free = freeChat({ store, now: () => LATE });
    await free.count("u1");
    await free.count("u1");
    expect(await free.used("u1")).toBe(2);
    expect(values.has(billingKeys.freeChat("u1", "2026-03-02"))).toBe(true);
  });

  it("shows the notice only once a day", async () => {
    const { store } = memoryStore();
    const free = freeChat({ store, now: () => LATE });
    expect(await free.noticeOnce("u1")).toBe(true);
    expect(await free.noticeOnce("u1")).toBe(false);
  });

  it("passes a Redis error through as null, so the turn is paid", async () => {
    const store: LimitStore = { ...openLimitStore, tryRead: async () => null };
    expect(await freeChat({ store, now: () => LATE }).used("u1")).toBeNull();
  });
});

describe("accountOpener (AC-11, the guest grant IP cap)", () => {
  const setup = (granted = billingConfig.grants.starter) => {
    const { store, values } = memoryStore();
    const ensureAccount = vi.fn(async (_u: string, grant: number) => ({
      created: true,
      granted: grant > 0 ? granted : 0,
    }));
    const open = accountOpener({
      store,
      ensureAccount,
      config: billingConfig,
      now: () => LATE,
    });
    const key = billingKeys.guestGrant("1.2.3.4", "2026-03-02");
    return { open, ensureAccount, values, key };
  };

  it("gives a guest the starter grant and counts the IP", async () => {
    const { open, ensureAccount, values, key } = setup();
    await open("g1", true, "1.2.3.4");
    expect(ensureAccount).toHaveBeenCalledWith("g1", 30);
    expect(values.get(key)).toBe(1);
  });

  it("gives the 4th guest from one IP in a Lagos day 0 credits", async () => {
    const { open, ensureAccount, values, key } = setup();
    values.set(key, billingConfig.grants.guestPerIpPerDay);
    await open("g4", true, "1.2.3.4");
    expect(ensureAccount).toHaveBeenCalledWith("g4", 0);
    expect(values.get(key)).toBe(3);
  });

  it("does not count the IP when no grant was written (account existed)", async () => {
    const { store, values } = memoryStore();
    const open = accountOpener({
      store,
      ensureAccount: async () => ({ created: false, granted: 0 }),
      config: billingConfig,
      now: () => LATE,
    });
    await open("g1", true, "1.2.3.4");
    expect(values.size).toBe(0);
  });

  it("never caps a signed in user or a guest with no IP", async () => {
    const { open, ensureAccount, values, key } = setup();
    values.set(key, 99);
    await open("a1", false, "1.2.3.4");
    await open("g2", true, null);
    expect(ensureAccount).toHaveBeenNthCalledWith(1, "a1", 30);
    expect(ensureAccount).toHaveBeenNthCalledWith(2, "g2", 30);
    expect(values.get(key)).toBe(99);
  });
});
