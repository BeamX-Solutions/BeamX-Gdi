import { describe, expect, it, vi } from "vitest";
import { billingConfig } from "./config";
import { cronAuthorized, runBillingCron, type CronDeps } from "./cron";

// Spec 0004, `/api/cron/billing`: the bearer check and the hold sweeps (AC-7, AC-10).

const SECRET = "a-long-enough-cron-secret";

const deps = (over: Partial<CronDeps> = {}) => {
  const releaseIdleHolds = vi.fn(async () => ({ idle: 2, chat: 1 }));
  const log = vi.fn();
  return {
    deps: {
      secret: SECRET,
      releaseIdleHolds,
      config: billingConfig,
      log,
      ...over,
    } satisfies CronDeps,
    releaseIdleHolds,
    log,
  };
};

describe("cronAuthorized", () => {
  it("accepts exactly `Bearer <secret>`", () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a wrong, missing or bare token", () => {
    expect(cronAuthorized("Bearer nope", SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized(SECRET, SECRET)).toBe(false);
  });

  it("refuses everything when the secret is unset", () => {
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("runBillingCron", () => {
  it("returns 401 and runs nothing without the token", async () => {
    const { deps: d, releaseIdleHolds } = deps();
    const result = await runBillingCron(d, "Bearer wrong");
    expect(result.status).toBe(401);
    expect(releaseIdleHolds).not.toHaveBeenCalled();
  });

  it("sweeps with the config's idle days and chat minutes", async () => {
    const { deps: d, releaseIdleHolds, log } = deps();
    const result = await runBillingCron(d, `Bearer ${SECRET}`);
    expect(releaseIdleHolds).toHaveBeenCalledWith(30, 15);
    expect(result).toEqual({
      status: 200,
      body: { releasedIdle: 2, releasedChat: 1 },
    });
    expect(log).toHaveBeenCalledWith("billing_cron", {
      idleHolds: 2,
      chatHolds: 1,
    });
  });
});
