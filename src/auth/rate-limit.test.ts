import { describe, expect, it, vi } from "vitest";
import type { RateRule, RateScript } from "./rate-limit";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const {
  ACCOUNT_RATE_RULES,
  AUTH_RATE_RULES,
  allowEmailCheck,
  allowSetPassword,
  rateKeys,
  rateLimiter,
} = await import("./rate-limit");

/** An in memory fixed window, the same rule as the Redis script. */
const memoryScript = (): RateScript & { readonly keys: string[] } => {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const script = async (key: string, rule: RateRule) => {
    keys.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n > rule.max ? ([0, rule.window] as const) : ([1, 0] as const);
  };
  return Object.assign(script, { keys });
};

describe("AUTH_RATE_RULES (spec 0009, AC-15)", () => {
  it("holds the spec limits per path", () => {
    expect(AUTH_RATE_RULES["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    expect(AUTH_RATE_RULES["/email-otp/send-verification-otp"]).toEqual({
      window: 60,
      max: 3,
    });
    expect(AUTH_RATE_RULES["/sign-in/email-otp"]).toEqual({
      window: 60,
      max: 5,
    });
    expect(AUTH_RATE_RULES["/email-otp/request-password-reset"]).toEqual({
      window: 60,
      max: 3,
    });
    expect(AUTH_RATE_RULES["/email-otp/reset-password"]).toEqual({
      window: 60,
      max: 3,
    });
    expect(AUTH_RATE_RULES["/sign-in/social"]).toEqual({ window: 60, max: 10 });
  });

  it("never limits the guest sign in in Better Auth", () => {
    expect(AUTH_RATE_RULES["/sign-in/anonymous"]).toBe(false);
  });
});

describe("rateLimiter.storage (Better Auth customStorage)", () => {
  const rule = { window: 60, max: 5 };

  it("allows 5 sign ins a minute from one IP and refuses the 6th", async () => {
    const limiter = rateLimiter(memoryScript());
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(
        await limiter.storage.consume("1.2.3.4|/sign-in/email", rule),
      );
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5]).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("keeps each key apart under the auth:rl prefix", async () => {
    const script = memoryScript();
    await rateLimiter(script).storage.consume("1.2.3.4|/sign-in/email", rule);
    expect(script.keys).toEqual(["auth:rl:1.2.3.4|/sign-in/email"]);
  });

  it("skips Better Auth's shared no IP bucket", async () => {
    const script = memoryScript();
    const limiter = rateLimiter(script);
    for (let i = 0; i < 10; i++)
      expect(
        (await limiter.storage.consume("no-trusted-ip|/sign-in/email", rule))
          .allowed,
      ).toBe(true);
    expect(script.keys).toEqual([]);
  });

  it("allows and logs when Redis fails", async () => {
    const log = vi.fn();
    const limiter = rateLimiter(async () => {
      throw new Error("down");
    }, log);
    expect(
      await limiter.storage.consume("1.2.3.4|/sign-in/email", rule),
    ).toEqual({ allowed: true, retryAfter: null });
    expect(log).toHaveBeenCalledWith("limit_check_failed", {
      limit: "auth_rate_limit",
    });
  });

  it("allows everything without Upstash", async () => {
    const limiter = rateLimiter(null);
    expect(
      (await limiter.consumeKey("k", { window: 60, max: 0 })).allowed,
    ).toBe(true);
  });
});

describe("allowEmailCheck (AC-8, AC-15)", () => {
  it("refuses the 4th check of one email in an hour, from any IP", async () => {
    const limiter = rateLimiter(memoryScript());
    const ips = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"];
    const results = [];
    for (const ip of ips)
      results.push(await allowEmailCheck(limiter, ip, "Ada@Example.com"));
    expect(results).toEqual([true, true, true, false]);
  });

  it("counts an email the same whatever its case or spaces", () => {
    expect(rateKeys.emailCheck(" Ada@Example.com ")).toBe(
      rateKeys.emailCheck("ada@example.com"),
    );
    expect(rateKeys.emailCheck("ada@example.com")).not.toContain("ada");
  });

  it("refuses the 6th check a minute from one IP", async () => {
    const limiter = rateLimiter(memoryScript());
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(await allowEmailCheck(limiter, "1.1.1.1", `u${i}@x.com`));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(ACCOUNT_RATE_RULES.emailCheckIp.max).toBe(5);
  });

  it("skips the IP limit with no IP, keeping the per email one", async () => {
    const script = memoryScript();
    await allowEmailCheck(rateLimiter(script), null, "a@x.com");
    expect(script.keys).toEqual([rateKeys.emailCheck("a@x.com")]);
  });
});

describe("allowSetPassword (AC-15)", () => {
  it("refuses the 6th a minute from one IP", async () => {
    const limiter = rateLimiter(memoryScript());
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(await allowSetPassword(limiter, "1.1.1.1"));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("allows with no IP", async () => {
    const script = memoryScript();
    expect(await allowSetPassword(rateLimiter(script), null)).toBe(true);
    expect(script.keys).toEqual([]);
  });
});
