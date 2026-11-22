import { describe, expect, it, vi } from "vitest";
import { limitGuestSignIn, type GuestLimitDeps } from "./guest-limit";

// Spec 0008, AC-8: the guest per IP cap on the anonymous sign in.

const IP = "102.89.1.2";

const deps = (count: number) => {
  const counted: string[] = [];
  const pending: Promise<unknown>[] = [];
  const value: GuestLimitDeps = {
    guard: {
      read: async () => count,
      count: async (ip) => {
        counted.push(ip);
      },
    },
    max: 30,
    waitUntil: (task) => {
      pending.push(task);
    },
    log: () => {},
  };
  return { value, counted, settle: () => Promise.all(pending) };
};

const okResponse = () => new Response("{}", { status: 200 });

describe("limitGuestSignIn", () => {
  it("refuses the 31st guest from one IP with 429 guest_limit and makes no guest", async () => {
    const d = deps(30);
    const signIn = vi.fn(async () => okResponse());
    const response = await limitGuestSignIn(d.value, IP, signIn);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "guest_limit" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("lets the 30th through and counts it once Better Auth answers 200", async () => {
    const d = deps(29);
    const response = await limitGuestSignIn(d.value, IP, async () =>
      okResponse(),
    );
    await d.settle();
    expect(response.status).toBe(200);
    expect(d.counted).toEqual([IP]);
  });

  it("does not count a sign in that failed", async () => {
    const d = deps(0);
    const response = await limitGuestSignIn(
      d.value,
      IP,
      async () => new Response("{}", { status: 500 }),
    );
    await d.settle();
    expect(response.status).toBe(500);
    expect(d.counted).toEqual([]);
  });

  it("skips the cap with no IP", async () => {
    const d = deps(999);
    const response = await limitGuestSignIn(d.value, null, async () =>
      okResponse(),
    );
    await d.settle();
    expect(response.status).toBe(200);
    expect(d.counted).toEqual([]);
  });
});
