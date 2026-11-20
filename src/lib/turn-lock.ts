/**
 * Server only. The per conversation chat turn lock (spec 0006, "Turn lock"):
 * `SET turn:<conversationId> <token> NX EX 60`, released by a compare and delete so a
 * turn never frees a lock a later turn took after this one expired.
 *
 * Without the Upstash variables the lock is off: every acquire succeeds and a
 * `turn_lock_disabled` line is logged once, so dev and CI run without Redis. Production
 * requires both (`env.ts`).
 */
import { Redis } from "@upstash/redis";
import { env } from "./env";
import { logEvent } from "./log";

export type TurnLock = {
  /** True when this turn now holds the lock. Never throws: a Redis error counts as taken. */
  readonly acquire: (conversationId: string, token: string) => Promise<boolean>;
  /** Frees the lock only if `token` still holds it. Never throws. */
  readonly release: (conversationId: string, token: string) => Promise<void>;
};

/** Seconds a lock lives if the function dies before releasing it. */
export const TURN_LOCK_TTL_S = 60;

const key = (conversationId: string) => `turn:${conversationId}`;

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export const redisTurnLock = (redis: Redis): TurnLock => ({
  acquire: async (conversationId, token) => {
    try {
      return (
        (await redis.set(key(conversationId), token, {
          nx: true,
          ex: TURN_LOCK_TTL_S,
        })) === "OK"
      );
    } catch {
      // Fail closed: the client sees the "one moment" notice and can send again,
      // rather than a 500, and two turns never run at once.
      logEvent("turn_lock_acquire_failed", { conversationId });
      return false;
    }
  },
  release: async (conversationId, token) => {
    try {
      await redis.eval(RELEASE, [key(conversationId)], [token]);
    } catch {
      // The lock expires on its own; a failed release only delays the next turn.
      logEvent("turn_lock_release_failed", { conversationId });
    }
  },
});

const disabledLock = (): TurnLock => {
  const warned = { done: false };
  return {
    acquire: async () => {
      if (!warned.done) {
        warned.done = true;
        logEvent("turn_lock_disabled", { reason: "no_upstash_env" });
      }
      return true;
    },
    release: async () => {},
  };
};

export const turnLock: TurnLock =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? redisTurnLock(
        new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        }),
      )
    : disabledLock();
