import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import type { LimitName, LimitStore } from "./limits";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { envSchema } = await import("./env");
const {
  DAILY_TTL_S,
  lagosDate,
  limitConfig,
  limitKeys,
  openLimitStore,
  overLimit,
  redisLimitStore,
  runGuard,
} = await import("./limits");

const base = {
  DATABASE_URL: "postgres://u:p@host/db",
  DATABASE_URL_UNPOOLED: "postgres://u:p@host/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://beamx.test",
};

describe("limitConfig (AC-10)", () => {
  it("uses the spec defaults when nothing is set, or a line is empty", () => {
    const e = envSchema(false).parse({ ...base, LIMIT_RUNS_PER_GUEST: "" });
    expect(limitConfig(e)).toEqual({
      spendCapUsd: 20,
      burstPerUser: 10,
      burstPerIp: 60,
      chatPerGuest: 30,
      chatsPerGuest: 20,
      runsPerGuest: 3,
      runsPerIp: 20,
      guestsPerIp: 30,
    });
  });

  it("takes every number from env", () => {
    const e = envSchema(false).parse({
      ...base,
      AI_DAILY_SPEND_CAP_USD: "2.5",
      LIMIT_BURST_PER_USER: "1",
      LIMIT_BURST_PER_IP: "2",
      LIMIT_CHAT_PER_GUEST: "3",
      LIMIT_CHATS_PER_GUEST: "4",
      LIMIT_RUNS_PER_GUEST: "5",
      LIMIT_RUNS_PER_IP: "6",
      LIMIT_GUESTS_PER_IP: "7",
    });
    expect(limitConfig(e)).toEqual({
      spendCapUsd: 2.5,
      burstPerUser: 1,
      burstPerIp: 2,
      chatPerGuest: 3,
      chatsPerGuest: 4,
      runsPerGuest: 5,
      runsPerIp: 6,
      guestsPerIp: 7,
    });
  });

  it("refuses a zero or negative limit", () => {
    expect(
      envSchema(false).safeParse({ ...base, LIMIT_RUNS_PER_GUEST: "0" })
        .success,
    ).toBe(false);
    expect(
      envSchema(false).safeParse({ ...base, AI_DAILY_SPEND_CAP_USD: "-1" })
        .success,
    ).toBe(false);
  });
});

describe("lagosDate (AC-10)", () => {
  it("rolls to the next day at 23:00 UTC, Lagos midnight", () => {
    expect(lagosDate(new Date("2026-11-22T22:59:59Z"))).toBe("2026-11-22");
    expect(lagosDate(new Date("2026-11-22T23:00:00Z"))).toBe("2026-11-23");
  });

  it("keys a day's counters by that Lagos date", () => {
    const day = lagosDate(new Date("2026-11-22T23:30:00Z"));
    expect(limitKeys.runsUser("u1", day)).toBe("limit:runs:user:u1:2026-11-23");
    expect(limitKeys.spend(day)).toBe("spend:2026-11-23");
  });
});

describe("overLimit", () => {
  it("refuses the one after the limit", () => {
    expect(overLimit(2, 3)).toBe(false);
    expect(overLimit(3, 3)).toBe(true);
  });
});

/** A pipeline that records its calls; `exec` returns what the test asks for. */
const fakeRedis = (opts: {
  readonly get?: () => Promise<unknown>;
  readonly exec?: () => Promise<unknown[]>;
  readonly set?: () => Promise<unknown>;
}) => {
  const calls: unknown[][] = [];
  const pipeline = {
    incr: (...a: unknown[]) => {
      calls.push(["incr", ...a]);
      return pipeline;
    },
    incrbyfloat: (...a: unknown[]) => {
      calls.push(["incrbyfloat", ...a]);
      return pipeline;
    },
    expire: (...a: unknown[]) => {
      calls.push(["expire", ...a]);
      return pipeline;
    },
    exec: vi.fn(opts.exec ?? (async () => [1, 1])),
  };
  const redis = {
    decr: vi.fn(async (...a: unknown[]) => {
      calls.push(["decr", ...a]);
      return 0;
    }),
    get: vi.fn(opts.get ?? (async () => null)),
    set: vi.fn(opts.set ?? (async () => "OK")),
    pipeline: () => pipeline,
  } as unknown as Redis;
  return { redis, calls };
};

const boom = async (): Promise<never> => {
  throw new Error("upstash down");
};

const allowAll = {
  user: async () => ({ success: true }),
  ip: async () => ({ success: true }),
};

describe("redisLimitStore", () => {
  it("counts with INCR and sets the 48 hour expiry in the same pipeline", async () => {
    const { redis, calls } = fakeRedis({});
    await redisLimitStore(redis, allowAll).count("chat_daily", "k");
    expect(calls).toEqual([
      ["incr", "k"],
      ["expire", "k", DAILY_TTL_S, "NX"],
    ]);
  });

  it("take returns the new count, with the expiry in the same pipeline", async () => {
    const { redis, calls } = fakeRedis({ exec: async () => [4, 1] });
    const store = redisLimitStore(redis, allowAll);
    expect(await store.take("runs_daily", "r")).toBe(4);
    await store.giveBack("runs_daily", "r");
    expect(calls).toEqual([
      ["incr", "r"],
      ["expire", "r", DAILY_TTL_S, "NX"],
      ["decr", "r"],
    ]);
  });

  it("reads a number, and 0 when the key is unset", async () => {
    const four = redisLimitStore(
      fakeRedis({ get: async () => "4" }).redis,
      allowAll,
    );
    expect(await four.read("chat_daily", "k")).toBe(4);
    const unset = redisLimitStore(fakeRedis({}).redis, allowAll);
    expect(await unset.read("chat_daily", "k")).toBe(0);
  });

  it("adds floats with a 48 hour expiry and returns the new total", async () => {
    const { redis, calls } = fakeRedis({ exec: async () => ["1.25", 1] });
    const store = redisLimitStore(redis, allowAll);
    expect(await store.addFloat("spend", "s", 0.5)).toBe(1.25);
    expect(calls).toEqual([
      ["incrbyfloat", "s", 0.5],
      ["expire", "s", DAILY_TTL_S, "NX"],
    ]);
  });

  it("setOnce is true only when SET NX took the key", async () => {
    const took = redisLimitStore(
      fakeRedis({ set: async () => "OK" }).redis,
      allowAll,
    );
    expect(await took.setOnce("spend", "t", "v", 60)).toBe(true);
    const taken = redisLimitStore(
      fakeRedis({ set: async () => null }).redis,
      allowAll,
    );
    expect(await taken.setOnce("spend", "t", "v", 60)).toBe(false);
  });

  it("asks the right window limiter for a burst check", async () => {
    const store = redisLimitStore(fakeRedis({}).redis, {
      user: async () => ({ success: false }),
      ip: async () => ({ success: true }),
    });
    expect(await store.burst("user", "u1")).toBe(false);
    expect(await store.burst("ip", "1.2.3.4")).toBe(true);
  });

  it("fails open and logs limit_check_failed with the limit name (AC-9)", async () => {
    const log = vi.fn();
    const { redis } = fakeRedis({ get: boom, exec: boom, set: boom });
    const store = redisLimitStore(redis, { user: boom, ip: boom }, log);
    expect(await store.read("runs_daily", "k")).toBe(0);
    await expect(store.count("chat_daily", "k")).resolves.toBeUndefined();
    expect(await store.addFloat("spend", "s", 1)).toBeNull();
    expect(await store.setOnce("spend", "t", "v", 1)).toBe(false);
    expect(await store.take("runs_daily", "r")).toBeNull();
    expect(await store.burst("user", "u1")).toBe(true);
    expect(await store.burst("ip", "1.2.3.4")).toBe(true);
    expect(log.mock.calls).toEqual([
      ["limit_check_failed", { limit: "runs_daily" }],
      ["limit_check_failed", { limit: "chat_daily" }],
      ["limit_check_failed", { limit: "spend" }],
      ["limit_check_failed", { limit: "spend" }],
      ["limit_check_failed", { limit: "runs_daily" }],
      ["limit_check_failed", { limit: "burst_user" }],
      ["limit_check_failed", { limit: "burst_ip" }],
    ]);
  });
});

describe("openLimitStore (no Upstash variables)", () => {
  it("allows everything", async () => {
    expect(await openLimitStore.read("chat_daily", "k")).toBe(0);
    expect(await openLimitStore.burst("user", "u1")).toBe(true);
    expect(await openLimitStore.addFloat("spend", "s", 5)).toBeNull();
  });
});

/** An in memory store for the run guard: real counts, yielding like Redis. */
const countingStore = (failing: ReadonlySet<string> = new Set()) => {
  const values = new Map<string, number>();
  const store = {
    ...openLimitStore,
    take: async (_name: LimitName, key: string) => {
      await Promise.resolve();
      if (failing.has(key)) return null;
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    },
    giveBack: async (_name: LimitName, key: string) => {
      values.set(key, (values.get(key) ?? 0) - 1);
    },
  };
  return { store, values };
};

describe("runGuard (AC-4)", () => {
  const NOW = new Date("2026-11-22T10:00:00Z");
  const USER = "limit:runs:user:g1:2026-11-22";
  const IP = "limit:runs:ip:1.2.3.4:2026-11-22";
  const guard = (store: LimitStore, runsPerGuest = 3, runsPerIp = 20) =>
    runGuard({ store, config: { runsPerGuest, runsPerIp }, now: () => NOW });

  it("allows 3 runs a day and refuses the 4th, giving both counts back", async () => {
    const { store, values } = countingStore();
    const { takeRun } = guard(store);
    for (let i = 0; i < 3; i += 1)
      expect((await takeRun("g1", "1.2.3.4")).ok).toBe(true);
    expect(await takeRun("g1", "1.2.3.4")).toEqual({
      ok: false,
      error: { code: "run_limit" },
    });
    expect(values.get(USER)).toBe(3);
    expect(values.get(IP)).toBe(3);
  });

  it("refuses the 21st from one IP across guests", async () => {
    const { store, values } = countingStore();
    const { takeRun } = guard(store, 3, 2);
    expect((await takeRun("a", "1.2.3.4")).ok).toBe(true);
    expect((await takeRun("b", "1.2.3.4")).ok).toBe(true);
    expect((await takeRun("c", "1.2.3.4")).ok).toBe(false);
    expect(values.get("limit:runs:user:c:2026-11-22")).toBe(0);
    expect(values.get(IP)).toBe(2);
  });

  it("starts only one of two parallel runs at the limit", async () => {
    const { store } = countingStore();
    const { takeRun } = guard(store, 1);
    const results = await Promise.all([
      takeRun("g1", null),
      takeRun("g1", null),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("giveBackRun undoes a run that failed to start", async () => {
    const { store, values } = countingStore();
    const { takeRun, giveBackRun } = guard(store);
    const ticket = await takeRun("g1", "1.2.3.4");
    if (!ticket.ok) throw new Error("expected a ticket");
    await giveBackRun(ticket.value);
    expect(values.get(USER)).toBe(0);
    expect(values.get(IP)).toBe(0);
  });

  it("skips the IP counter with no IP, and never gives back a failed take", async () => {
    const { store, values } = countingStore(new Set([USER]));
    const { takeRun, giveBackRun } = guard(store);
    const ticket = await takeRun("g1", "1.2.3.4");
    expect(ticket).toEqual({ ok: true, value: { keys: [IP] } });
    if (ticket.ok) await giveBackRun(ticket.value);
    expect(values.has(USER)).toBe(false);
    const noIp = await guard(countingStore().store).takeRun("g1", null);
    expect(noIp).toEqual({ ok: true, value: { keys: [USER] } });
  });
});
