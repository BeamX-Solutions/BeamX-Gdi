/**
 * Server only. Resumable chat streams (spec 0007, AC-6, step 8): `resumable-stream` on
 * Upstash, through its REST client, so no TCP connection is needed on Vercel.
 *
 * While a reply streams, its SSE text is buffered in Redis and the stream id is kept at
 * `chat:active:<conversationId>` (5 minute expiry). Each new turn replaces it, and the
 * turn deletes it once its reply is saved. A reload asks for the active stream and gets
 * the reply replayed from the start, or nothing when the key is gone.
 *
 * Without the Upstash variables resuming is off: nothing is buffered and every resume
 * answers "nothing to resume", so dev and CI run without Redis. Production requires both
 * (`env.ts`).
 */
import { Redis } from "@upstash/redis";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type Publisher,
  type Subscriber,
} from "resumable-stream/generic";
import { env } from "./env";
import { logEvent } from "./log";

export type ResumableStreams = {
  /**
   * Buffers `sse` as the conversation's active stream. Never throws: a Redis failure
   * only means this reply can't be resumed.
   */
  readonly start: (
    conversationId: string,
    streamId: string,
    sse: ReadableStream<string>,
  ) => Promise<void>;
  /** Forgets the active stream, only if it is still `streamId`. Never throws. */
  readonly finish: (conversationId: string, streamId: string) => Promise<void>;
  /** The active stream replayed from its start, or null when there is none. Never throws. */
  readonly resume: (
    conversationId: string,
  ) => Promise<ReadableStream<string> | null>;
};

/** Seconds the active stream pointer lives (spec 0007, step 8). */
export const ACTIVE_STREAM_TTL_S = 300;

/** How long a subscribe waits for Upstash to confirm (seconds away on a slow local link). */
const SUBSCRIBE_TIMEOUT_MS = 15_000;

const activeKey = (conversationId: string) => `chat:active:${conversationId}`;

const FINISH = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Pub/sub messages go JSON encoded. The Upstash subscription is itself SSE and the client
 * splits it on "\n", so a raw SSE chunk (or the library's replay buffer, many events in
 * one message) would arrive cut at its first newline. JSON escapes the newlines.
 */
const encode = (message: string): string => JSON.stringify(message);

const decode = (message: unknown): string => {
  if (typeof message !== "string") return JSON.stringify(message);
  try {
    const parsed: unknown = JSON.parse(message);
    return typeof parsed === "string" ? parsed : message;
  } catch {
    return message;
  }
};

/** `resumable-stream`'s publisher over the Upstash REST client. */
export const upstashPublisher = (redis: Redis): Publisher => ({
  connect: async () => {},
  publish: (channel, message) => redis.publish(channel, encode(message)),
  set: (key, value, options) =>
    options?.EX === undefined
      ? redis.set(key, value)
      : redis.set(key, value, { ex: options.EX }),
  get: async (key) => {
    const value = await redis.get<string | number>(key);
    return value ?? null;
  },
  incr: (key) => redis.incr(key),
});

/**
 * `resumable-stream`'s subscriber over the Upstash REST client. `subscribe` resolves only
 * once Upstash confirms the subscription, because the library publishes right after it
 * and a message sent before the subscription is live would be lost.
 */
export const upstashSubscriber = (redis: Redis): Subscriber => {
  const live = new Map<string, ReturnType<Redis["subscribe"]>>();
  return {
    connect: async () => {},
    subscribe: (channel, callback) =>
      new Promise<void>((resolve, reject) => {
        const sub = redis.subscribe<unknown>([channel]);
        live.set(channel, sub);
        const timer = setTimeout(
          () => reject(new Error("subscribe_timeout")),
          SUBSCRIBE_TIMEOUT_MS,
        );
        sub.on("subscribe", () => {
          clearTimeout(timer);
          resolve();
        });
        sub.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        sub.on("message", ({ message }) => callback(decode(message)));
      }),
    unsubscribe: async (channel) => {
      const sub = live.get(channel);
      live.delete(channel);
      await sub?.unsubscribe();
    },
  };
};

export const redisResumableStreams = (redis: Redis): ResumableStreams => {
  const context = createResumableStreamContext({
    keyPrefix: "resumable-stream",
    waitUntil: after,
    publisher: upstashPublisher(redis),
    subscriber: upstashSubscriber(redis),
  });
  return {
    start: async (conversationId, streamId, sse) => {
      try {
        await redis.set(activeKey(conversationId), streamId, {
          ex: ACTIVE_STREAM_TTL_S,
        });
        await context.createNewResumableStream(streamId, () => sse);
      } catch {
        logEvent("resumable_start_failed", { conversationId, streamId });
        // The copy must still be drained, or the tee holds the reply in memory.
        await sse.cancel().catch(() => {});
      }
    },
    finish: async (conversationId, streamId) => {
      try {
        await redis.eval(FINISH, [activeKey(conversationId)], [streamId]);
      } catch {
        // The pointer expires on its own; a reload meanwhile replays the saved reply.
        logEvent("resumable_finish_failed", { conversationId, streamId });
      }
    },
    resume: async (conversationId) => {
      try {
        const streamId = await redis.get<string>(activeKey(conversationId));
        if (streamId === null) return null;
        return (await context.resumeExistingStream(streamId)) ?? null;
      } catch {
        logEvent("resumable_resume_failed", { conversationId });
        return null;
      }
    },
  };
};

const disabledResumableStreams: ResumableStreams = {
  start: async (_conversationId, _streamId, sse) => {
    await sse.cancel().catch(() => {});
  },
  finish: async () => {},
  resume: async () => null,
};

/** Whether replies are buffered for resuming (the Upstash variables are set). */
export const resumableEnabled = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
);

export const resumableStreams: ResumableStreams =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? redisResumableStreams(
        // Raw strings in and out: the library stores SSE text and its own JSON.
        new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
          automaticDeserialization: false,
        }),
      )
    : disabledResumableStreams;
