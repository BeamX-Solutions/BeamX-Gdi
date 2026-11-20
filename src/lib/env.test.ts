import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { envSchema } = await import("./env");

const base = {
  DATABASE_URL: "postgres://u:p@host/db",
  DATABASE_URL_UNPOOLED: "postgres://u:p@host/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://beamx.test",
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
