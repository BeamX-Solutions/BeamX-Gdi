/**
 * Server only. The auth rate limits (spec 0009, AC-15): Better Auth's `customStorage`
 * over Upstash, its per path rules, and the same counter for our `/api/account/*` routes
 * (Better Auth only limits requests that pass through its handler).
 *
 * Each check is one atomic script (increment, set the window expiry on the first hit,
 * report whether it fits), a fixed window per key. Like spec 0008 it fails open: a Redis
 * error, or no Upstash variables, allows the request and logs `limit_check_failed`.
 * With no client IP the IP limits are skipped, never pooled into one shared bucket.
 */
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";

export type RateRule = { readonly window: number; readonly max: number };
export type ConsumeResult = {
  readonly allowed: boolean;
  readonly retryAfter: number | null;
};

/** Better Auth paths (without `/api/auth`) and their per IP limits. */
export const AUTH_RATE_RULES: Readonly<Record<string, RateRule | false>> = {
  "/sign-in/email": { window: 60, max: 5 },
  "/email-otp/send-verification-otp": { window: 60, max: 3 },
  "/sign-in/email-otp": { window: 60, max: 5 },
  "/email-otp/request-password-reset": { window: 60, max: 3 },
  "/email-otp/reset-password": { window: 60, max: 3 },
  "/email-otp/check-verification-otp": { window: 60, max: 5 },
  "/set-password": { window: 60, max: 5 },
  "/sign-in/social": { window: 60, max: 10 },
  // Spec 0008's guest per IP cap guards the guest sign in instead.
  "/sign-in/anonymous": false,
  // A session read has no abuse value; skipping it saves a Redis call per page view.
  "/get-session": false,
};

/** Our account routes' limits (AC-15). */
export const ACCOUNT_RATE_RULES = {
  emailCheckIp: { window: 60, max: 5 },
  emailCheckEmail: { window: 60 * 60, max: 3 },
  setPasswordIp: { window: 60, max: 5 },
} as const satisfies Record<string, RateRule>;

/** Redis key names (spec 0009, "Data model sketch"). Pure. */
export const rateKeys = {
  /** Better Auth's own key is `<ip>|<path>`. */
  auth: (key: string) => `auth:rl:${key}`,
  account: (ip: string, route: string) => `auth:rl:${ip}|/account/${route}`,
  emailCheck: (email: string) =>
    `auth:email-check:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`,
} as const;

/** Better Auth's key when it found no client IP (one shared bucket we never use). */
const NO_IP_PREFIX = "no-trusted-ip|";

/**
 * Runs the atomic check on one Redis key: `[1, 0]` when it fits, `[0, ttl]` when over.
 */
export type RateScript = (
  key: string,
  rule: RateRule,
) => Promise<readonly [number, number]>;

const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if n > tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {0, ttl}
end
return {1, 0}`;

export const redisRateScript =
  (redis: Redis): RateScript =>
  async (key, rule) => {
    const [fits, ttl] = await redis.eval<string[], [number, number]>(
      SCRIPT,
      [key],
      [String(rule.window), String(rule.max)],
    );
    return [Number(fits), Number(ttl)];
  };

type Log = typeof logEvent;

export type RateLimiter = {
  /** One request against the full Redis `key`. Never throws (fails open). */
  readonly consumeKey: (key: string, rule: RateRule) => Promise<ConsumeResult>;
  /** Better Auth's `customStorage`. */
  readonly storage: {
    readonly consume: (key: string, rule: RateRule) => Promise<ConsumeResult>;
  };
};

const ALLOWED: ConsumeResult = { allowed: true, retryAfter: null };

export const rateLimiter = (
  script: RateScript | null,
  log: Log = logEvent,
): RateLimiter => {
  const consumeKey = async (
    key: string,
    rule: RateRule,
  ): Promise<ConsumeResult> => {
    if (script === null) return ALLOWED;
    try {
      const [fits, ttl] = await script(key, rule);
      return fits === 1
        ? ALLOWED
        : { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
    } catch {
      log("limit_check_failed", { limit: "auth_rate_limit" });
      return ALLOWED;
    }
  };
  return {
    consumeKey,
    storage: {
      consume: (key, rule) =>
        key.startsWith(NO_IP_PREFIX)
          ? Promise.resolve(ALLOWED)
          : consumeKey(rateKeys.auth(key), rule),
    },
  };
};

/**
 * The email check's limits (AC-15): 5 a minute per IP and 3 an hour per email, both
 * counted on every call. True when the request may go on.
 */
export const allowEmailCheck = async (
  limiter: RateLimiter,
  ip: string | null,
  email: string,
): Promise<boolean> => {
  const [byIp, byEmail] = await Promise.all([
    ip === null
      ? ALLOWED
      : limiter.consumeKey(
          rateKeys.account(ip, "email-check"),
          ACCOUNT_RATE_RULES.emailCheckIp,
        ),
    limiter.consumeKey(
      rateKeys.emailCheck(email),
      ACCOUNT_RATE_RULES.emailCheckEmail,
    ),
  ]);
  return byIp.allowed && byEmail.allowed;
};

/** Set password: 5 a minute per IP (AC-15). True when the request may go on. */
export const allowSetPassword = async (
  limiter: RateLimiter,
  ip: string | null,
): Promise<boolean> =>
  ip === null
    ? true
    : (
        await limiter.consumeKey(
          rateKeys.account(ip, "set-password"),
          ACCOUNT_RATE_RULES.setPasswordIp,
        )
      ).allowed;

/** The body every rate limited auth request answers with (`429`). */
export const RATE_LIMITED_BODY = { code: "rate_limited" } as const;

/** The limiter for this deploy: open when Upstash is not configured (dev, CI). */
export const authRateLimiter: RateLimiter = rateLimiter(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? redisRateScript(
        new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        }),
      )
    : null,
);
