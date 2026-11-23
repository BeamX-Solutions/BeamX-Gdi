import { describe, expect, it, vi } from "vitest";
import { billingConfig } from "./config";
import {
  cronAuthorized,
  runBillingSweeps,
  runDailyJobs,
  runDriftCheck,
  runExpiry,
  type BillingSweepDeps,
} from "./cron";

// Spec 0004, `/api/cron/billing`: the bearer check and the hold sweeps (AC-7, AC-10);
// spec 0009: every daily job runs independently.

const SECRET = "a-long-enough-cron-secret";

const deps = (over: Partial<BillingSweepDeps> = {}) => {
  const releaseIdleHolds = vi.fn(async () => ({ idle: 2, chat: 1 }));
  const log = vi.fn();
  return {
    deps: {
      releaseIdleHolds,
      config: billingConfig,
      log,
      ...over,
    } satisfies BillingSweepDeps,
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

describe("runBillingSweeps", () => {
  it("sweeps with the config's idle days and chat minutes", async () => {
    const { deps: d, releaseIdleHolds, log } = deps();
    expect(await runBillingSweeps(d)).toEqual({
      releasedIdle: 2,
      releasedChat: 1,
    });
    expect(releaseIdleHolds).toHaveBeenCalledWith(30, 15);
    expect(log).toHaveBeenCalledWith("billing_cron", {
      idleHolds: 2,
      chatHolds: 1,
    });
  });
});

describe("runExpiry (AC-15)", () => {
  it("only counts while enforcement is off, with the config's months and Lagos day", async () => {
    const expireInactive = vi.fn(async () => ({
      due: 2,
      expired: 0,
      credits: 80,
    }));
    const log = vi.fn();
    expect(
      await runExpiry({ expireInactive, config: billingConfig, log }),
    ).toEqual({ enforced: false, due: 2, expired: 0, credits: 80 });
    expect(expireInactive).toHaveBeenCalledWith(12, "Africa/Lagos", false);
    expect(log).toHaveBeenCalledWith("credit_expiry", {
      enforced: false,
      due: 2,
      expired: 0,
      credits: 80,
    });
  });

  it("passes enforce through when the flag is on", async () => {
    const expireInactive = vi.fn(async () => ({
      due: 1,
      expired: 1,
      credits: 30,
    }));
    await runExpiry({
      expireInactive,
      config: {
        ...billingConfig,
        expiry: { ...billingConfig.expiry, enforce: true },
      },
      log: vi.fn(),
    });
    expect(expireInactive).toHaveBeenCalledWith(12, "Africa/Lagos", true);
  });
});

describe("runDriftCheck (AC-20)", () => {
  it("logs one credit_drift line per drifted user and repairs nothing", async () => {
    const d = {
      userId: "u1",
      balance: 30,
      ledgerSum: 20,
      held: 0,
      activeHeld: 0,
    };
    const log = vi.fn();
    expect(await runDriftCheck({ findDrift: async () => [d], log })).toEqual({
      drifted: 1,
    });
    expect(log).toHaveBeenCalledWith("credit_drift", d);
  });

  it("logs nothing when every account checks out", async () => {
    const log = vi.fn();
    expect(await runDriftCheck({ findDrift: async () => [], log })).toEqual({
      drifted: 0,
    });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("runDailyJobs (spec 0009)", () => {
  it("returns 401 and runs nothing without the token", async () => {
    const job = vi.fn(async () => ({}));
    const result = await runDailyJobs(
      { secret: SECRET, jobs: { billing: job }, log: vi.fn() },
      "Bearer wrong",
    );
    expect(result.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("answers 200 with each job's counts", async () => {
    const result = await runDailyJobs(
      {
        secret: SECRET,
        jobs: {
          billing: async () => ({ releasedIdle: 1 }),
          purge: async () => ({ deleted: 3 }),
        },
        log: vi.fn(),
      },
      `Bearer ${SECRET}`,
    );
    expect(result).toEqual({
      status: 200,
      body: { billing: { releasedIdle: 1 }, purge: { deleted: 3 } },
    });
  });

  it("keeps running the others when one job throws, and logs it", async () => {
    const log = vi.fn();
    const purge = vi.fn(async () => ({ deleted: 2 }));
    const result = await runDailyJobs(
      {
        secret: SECRET,
        jobs: {
          billing: async () => {
            throw new TypeError("db down");
          },
          purge,
        },
        log,
      },
      `Bearer ${SECRET}`,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      billing: { error: "TypeError" },
      purge: { deleted: 2 },
    });
    expect(purge).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("daily_job_failed", {
      job: "billing",
      error: "TypeError",
    });
  });
});
