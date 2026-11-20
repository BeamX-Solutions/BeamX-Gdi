import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";

const { logEvent } = vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
  return { logEvent: vi.fn() };
});

vi.mock("./log", () => ({ logEvent }));

const { redisTurnLock, TURN_LOCK_TTL_S } = await import("./turn-lock");

/** Only the two Redis calls the lock makes. */
const fakeRedis = (set: () => Promise<unknown>) =>
  ({
    set: vi.fn(set),
    eval: vi.fn(async () => 1),
  }) as unknown as Redis & { set: ReturnType<typeof vi.fn> };

describe("redisTurnLock.acquire", () => {
  it("holds the lock when SET NX succeeds, with the expiry", async () => {
    const redis = fakeRedis(async () => "OK");
    expect(await redisTurnLock(redis).acquire("c1", "t1")).toBe(true);
    expect(redis.set).toHaveBeenCalledWith("turn:c1", "t1", {
      nx: true,
      ex: TURN_LOCK_TTL_S,
    });
  });

  it("reports taken when another turn holds it", async () => {
    const redis = fakeRedis(async () => null);
    expect(await redisTurnLock(redis).acquire("c1", "t1")).toBe(false);
  });

  it("fails closed and logs when Redis errors, instead of throwing", async () => {
    const redis = fakeRedis(async () => {
      throw new Error("upstash timeout");
    });
    await expect(redisTurnLock(redis).acquire("c1", "t1")).resolves.toBe(false);
    expect(logEvent).toHaveBeenCalledWith("turn_lock_acquire_failed", {
      conversationId: "c1",
    });
  });
});
