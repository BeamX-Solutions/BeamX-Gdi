import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { envSchema, fakeAiEnabled } = await import("./env");

const base = {
  DATABASE_URL: "postgres://u:p@host/db",
  DATABASE_URL_UNPOOLED: "postgres://u:p@host/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://beamx.test",
  CRON_SECRET: "c".repeat(32),
  BILLING_HASH_SECRET: "h".repeat(32),
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "BeamX <no-reply@beamx.test>",
};

const upstash = {
  UPSTASH_REDIS_REST_URL: "https://redis.upstash.test",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

describe("envSchema: the Upstash variables behind the turn lock", () => {
  it("lets dev, CI and preview run without them (the lock is off)", () => {
    expect(envSchema(false).safeParse(base).success).toBe(true);
  });

  it("fails a production deploy that is missing them, naming each one", () => {
    const result = envSchema(true).safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ]);
  });

  it("treats an empty line from .env.example as missing in production", () => {
    const result = envSchema(true).safeParse({
      ...base,
      ...upstash,
      UPSTASH_REDIS_REST_TOKEN: "",
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      "UPSTASH_REDIS_REST_TOKEN",
    ]);
  });

  it("accepts a production deploy that sets both", () => {
    expect(envSchema(true).safeParse({ ...base, ...upstash }).success).toBe(
      true,
    );
  });
});

describe("envSchema: CRON_SECRET for the daily billing job (spec 0004)", () => {
  it("is optional in dev, CI and preview", () => {
    const rest = { ...base, CRON_SECRET: undefined };
    expect(envSchema(false).safeParse(rest).success).toBe(true);
  });

  it("fails a production deploy without it, or with an empty line", () => {
    const rest = { ...base, CRON_SECRET: undefined };
    for (const extra of [{}, { CRON_SECRET: "" }]) {
      const result = envSchema(true).safeParse({
        ...rest,
        ...upstash,
        ...extra,
      });
      expect(result.error?.issues.map((i) => i.path[0])).toEqual([
        "CRON_SECRET",
      ]);
    }
  });

  it("refuses a secret under 16 characters", () => {
    expect(
      envSchema(false).safeParse({ ...base, CRON_SECRET: "short" }).success,
    ).toBe(false);
  });
});

describe("envSchema: BILLING_HASH_SECRET for the sign up grant (spec 0004)", () => {
  it("is optional in dev, CI and preview", () => {
    const rest = { ...base, BILLING_HASH_SECRET: undefined };
    expect(envSchema(false).safeParse(rest).success).toBe(true);
  });

  it("fails a production deploy without it, or with an empty line", () => {
    const rest = { ...base, BILLING_HASH_SECRET: undefined };
    for (const extra of [{}, { BILLING_HASH_SECRET: "" }]) {
      const result = envSchema(true).safeParse({
        ...rest,
        ...upstash,
        ...extra,
      });
      expect(result.error?.issues.map((i) => i.path[0])).toEqual([
        "BILLING_HASH_SECRET",
      ]);
    }
  });

  it("refuses a key under 32 characters", () => {
    expect(
      envSchema(false).safeParse({ ...base, BILLING_HASH_SECRET: "short" })
        .success,
    ).toBe(false);
  });
});

describe("envSchema: the Resend variables for code emails (spec 0009)", () => {
  it("are optional in dev, CI and preview (codes are logged instead)", () => {
    const rest = { ...base, RESEND_API_KEY: undefined, EMAIL_FROM: undefined };
    expect(envSchema(false).safeParse(rest).success).toBe(true);
  });

  it("fail a production deploy missing either one, or with an empty line", () => {
    const result = envSchema(true).safeParse({
      ...base,
      ...upstash,
      RESEND_API_KEY: "",
      EMAIL_FROM: undefined,
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      "RESEND_API_KEY",
      "EMAIL_FROM",
    ]);
  });
});

describe("E2E_FAKE_AI: the scripted fake models (spec 0007)", () => {
  const parsed = (extra: Record<string, string>) =>
    envSchema(false).parse({ ...base, ...extra });

  it("is off unless set", () => {
    expect(fakeAiEnabled(parsed({}))).toBe(false);
  });

  it("turns on for `next start` in e2e (NODE_ENV=production, not on Vercel)", () => {
    expect(fakeAiEnabled(parsed({ E2E_FAKE_AI: "true" }))).toBe(true);
  });

  it("stays off on a production deploy even when set", () => {
    expect(
      fakeAiEnabled(parsed({ E2E_FAKE_AI: "true", VERCEL_ENV: "production" })),
    ).toBe(false);
  });

  it("fails a production deploy that sets it", () => {
    const result = envSchema(true).safeParse({
      ...base,
      ...upstash,
      E2E_FAKE_AI: "true",
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["E2E_FAKE_AI"]);
  });
});
