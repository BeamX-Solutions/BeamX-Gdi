/**
 * Server only. The abuse limits (spec 0008): the pure policy (config from env, the Lagos
 * day, key names) and a small Redis store every guard goes through.
 *
 * Every store call fails open (AC-9): a Redis error, or no Upstash variables at all,
 * lets the request through, and an error logs `limit_check_failed` with the limit name.
 * No limit ever turns into a 500.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { localDate } from "@/billing/pricing";
import { env, type Env } from "./env";
import { logEvent } from "./log";

/** Every limit number and the spend cap (AC-10). */
export type LimitConfig = {
  readonly spendCapUsd: number;
  readonly burstPerUser: number;
  readonly burstPerIp: number;
  readonly chatPerGuest: number;
  readonly chatsPerGuest: number;
  readonly runsPerGuest: number;
  readonly runsPerIp: number;
  readonly guestsPerIp: number;
};

export const limitConfig = (e: Env): LimitConfig => ({
  spendCapUsd: e.AI_DAILY_SPEND_CAP_USD,
  burstPerUser: e.LIMIT_BURST_PER_USER,
  burstPerIp: e.LIMIT_BURST_PER_IP,
  chatPerGuest: e.LIMIT_CHAT_PER_GUEST,
  chatsPerGuest: e.LIMIT_CHATS_PER_GUEST,
  runsPerGuest: e.LIMIT_RUNS_PER_GUEST,
  runsPerIp: e.LIMIT_RUNS_PER_IP,
  guestsPerIp: e.LIMIT_GUESTS_PER_IP,
});

/** Daily counters reset at midnight in Lagos (AC-10). */
export const LIMIT_TIME_ZONE = "Africa/Lagos";

/** The Lagos calendar day, `YYYY-MM-DD`. Pure. */
export const lagosDate = (now: Date): string => localDate(now, LIMIT_TIME_ZONE);

/** Daily keys outlive their day, so a late request still finds yesterday's count. */
export const DAILY_TTL_S = 48 * 60 * 60;
/** The spend tripped marker is kept a week. */
export const TRIPPED_TTL_S = 7 * 24 * 60 * 60;

/** Redis key names (spec 0008, "Data model sketch"). Pure. */
export const limitKeys = {
  chat: (userId: string, day: string) => `limit:chat:${userId}:${day}`,
  chats: (userId: string, day: string) => `limit:chats:${userId}:${day}`,
  runsUser: (userId: string, day: string) => `limit:runs:user:${userId}:${day}`,
  runsIp: (ip: string, day: string) => `limit:runs:ip:${ip}:${day}`,
  guests: (ip: string, day: string) => `limit:guests:${ip}:${day}`,
  spend: (day: string) => `spend:${day}`,
  spendTripped: (day: string) => `spend:tripped:${day}`,
} as const;

/**
 * Whether one more is refused, given how many already happened today. With a limit of 3,
 * a count of 3 refuses the 4th. Pure.
 */
export const overLimit = (count: number, max: number): boolean => count >= max;

/** The names logged with `limit_check_failed`. */
export type LimitName =
  | "burst_user"
  | "burst_ip"
  | "chat_daily"
  | "chats_daily"
  | "runs_daily"
  | "guests_daily"
  | "spend";

export type BurstWindow = "user" | "ip";

/**
 * The Redis side of every guard. Each method never throws: on an error it logs
 * `limit_check_failed` and returns the value that lets the request through.
 */
export type LimitStore = {
  /** The number at `key`, 0 when unset or on an error. */
  readonly read: (name: LimitName, key: string) => Promise<number>;
  /** Adds one to `key`, setting its 48 hour expiry if it has none. */
  readonly count: (name: LimitName, key: string) => Promise<void>;
  /** Adds `by` to the float at `key` (48 hour expiry); the new total, or null. */
  readonly addFloat: (
    name: LimitName,
    key: string,
    by: number,
  ) => Promise<number | null>;
  /** `SET key value NX EX ttl`: true only when this call set it. */
  readonly setOnce: (
    name: LimitName,
    key: string,
    value: string,
    ttlS: number,
  ) => Promise<boolean>;
  /** True when one more request fits in the per minute window for `id`. */
  readonly burst: (window: BurstWindow, id: string) => Promise<boolean>;
};

type Log = typeof logEvent;

/** Runs `task`, or logs the failure and returns `fallback` (AC-9). */
const failOpen = async <T>(
  log: Log,
  name: LimitName,
  fallback: T,
  task: () => Promise<T>,
): Promise<T> => {
  try {
    return await task();
  } catch {
    log("limit_check_failed", { limit: name });
    return fallback;
  }
};

const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** One sliding window check: `{ success }` from `@upstash/ratelimit`. */
export type BurstLimiter = (
  id: string,
) => Promise<{ readonly success: boolean }>;

export const redisLimitStore = (
  redis: Redis,
  limiters: Readonly<Record<BurstWindow, BurstLimiter>>,
  log: Log = logEvent,
): LimitStore => ({
  read: (name, key) =>
    failOpen(log, name, 0, async () => toNumber(await redis.get(key))),
  count: (name, key) =>
    failOpen(log, name, undefined, async () => {
      await redis.pipeline().incr(key).expire(key, DAILY_TTL_S, "NX").exec();
    }),
  addFloat: (name, key, by) =>
    failOpen(log, name, null, async () => {
      const [total] = await redis
        .pipeline()
        .incrbyfloat(key, by)
        .expire(key, DAILY_TTL_S, "NX")
        .exec<[number | string, number]>();
      return toNumber(total);
    }),
  setOnce: (name, key, value, ttlS) =>
    failOpen(
      log,
      name,
      false,
      async () =>
        (await redis.set(key, value, { nx: true, ex: ttlS })) === "OK",
    ),
  burst: (window, id) =>
    failOpen(
      log,
      window === "user" ? "burst_user" : "burst_ip",
      true,
      async () => (await limiters[window](id)).success,
    ),
});

/** No Upstash variables (dev, CI): every limit allows, like the turn lock. */
export const openLimitStore: LimitStore = {
  read: async () => 0,
  count: async () => {},
  addFloat: async () => null,
  setOnce: async () => false,
  burst: async () => true,
};

const slidingWindow = (redis: Redis, prefix: string, max: number) => {
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, "1 m"),
    prefix,
    analytics: false,
  });
  return (id: string) => limiter.limit(id);
};

const makeStore = (e: Env): LimitStore => {
  if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN)
    return openLimitStore;
  const redis = new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisLimitStore(redis, {
    user: slidingWindow(redis, "limit:burst:user", e.LIMIT_BURST_PER_USER),
    ip: slidingWindow(redis, "limit:burst:ip", e.LIMIT_BURST_PER_IP),
  });
};

/** The store and config for this deploy. */
export const limitStore: LimitStore = makeStore(env);
export const limits: LimitConfig = limitConfig(env);
