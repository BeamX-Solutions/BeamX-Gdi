import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import { createResumableStreamContext } from "resumable-stream/generic";

const { logEvent } = vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
  return { logEvent: vi.fn() };
});

vi.mock("./log", () => ({ logEvent }));
vi.mock("next/server", () => ({ after: () => {} }));

const {
  ACTIVE_STREAM_TTL_S,
  redisResumableStreams,
  upstashPublisher,
  upstashSubscriber,
} = await import("./resumable");

// Spec 0007, AC-6. The real `resumable-stream` library runs over an in memory stand in
// for the Upstash REST client: the same calls, and pub/sub that confirms a subscription
// and delivers messages a moment later, like the real SSE subscription does.

type Listener = (event: unknown) => void;

const tick = () => new Promise((r) => setTimeout(r, 2));

const memoryRedis = () => {
  const store = new Map<string, string>();
  const channels = new Map<string, Set<(message: string) => void>>();
  const redis = {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: async (key: string) => store.get(key) ?? null,
    incr: async (key: string) => {
      const next = Number(store.get(key) ?? "0") + 1;
      if (Number.isNaN(next)) throw new Error("not an integer");
      store.set(key, String(next));
      return next;
    },
    eval: async (_script: string, [key]: string[], [value]: string[]) => {
      if (key !== undefined && store.get(key) === value) store.delete(key);
      return 1;
    },
    publish: async (channel: string, message: string) => {
      const subs = [...(channels.get(channel) ?? [])];
      await tick();
      for (const deliver of subs) deliver(message);
      return subs.length;
    },
    subscribe: ([channel]: string[]) => {
      const listeners = new Map<string, Set<Listener>>();
      const emit = (type: string, event: unknown) =>
        listeners.get(type)?.forEach((l) => l(event));
      const deliver = (message: string) =>
        emit("message", { channel, message });
      if (channel !== undefined) {
        void tick().then(() => {
          const set = channels.get(channel) ?? new Set();
          set.add(deliver);
          channels.set(channel, set);
          emit("subscribe", set.size);
        });
      }
      return {
        on: (type: string, l: Listener) => {
          const set = listeners.get(type) ?? new Set();
          set.add(l);
          listeners.set(type, set);
        },
        unsubscribe: async () => {
          if (channel !== undefined) channels.get(channel)?.delete(deliver);
        },
      };
    },
  };
  return { redis: redis as unknown as Redis, store, raw: redis };
};

const read = async (stream: ReadableStream<string>) => {
  const reader = stream.getReader();
  const out: string[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return out.join("");
    out.push(next.value);
  }
};

const slowStream = (parts: readonly string[], gapMs: number) =>
  new ReadableStream<string>({
    start: async (c) => {
      for (const part of parts) {
        c.enqueue(part);
        await new Promise((r) => setTimeout(r, gapMs));
      }
      c.close();
    },
  });

const PARTS = Array.from({ length: 6 }, (_, i) => `data: {"n":${i}}\n\n`);

describe("Upstash adapters under resumable-stream", () => {
  it("a reader joining partway gets the whole reply, once", async () => {
    const { redis } = memoryRedis();
    const context = () =>
      createResumableStreamContext({
        waitUntil: null,
        publisher: upstashPublisher(redis),
        subscriber: upstashSubscriber(redis),
      });
    const first = await context().createNewResumableStream("s1", () =>
      slowStream(PARTS, 15),
    );
    const firstDone = read(first!);
    await new Promise((r) => setTimeout(r, 35));
    const resumed = await context().resumeExistingStream("s1");
    expect(await read(resumed!)).toBe(PARTS.join(""));
    expect(await firstDone).toBe(PARTS.join(""));
  });

  it("a finished stream resumes to null", async () => {
    const { redis } = memoryRedis();
    const context = createResumableStreamContext({
      waitUntil: null,
      publisher: upstashPublisher(redis),
      subscriber: upstashSubscriber(redis),
    });
    await read(
      (await context.createNewResumableStream("s2", () =>
        slowStream(PARTS, 1),
      ))!,
    );
    expect(await context.resumeExistingStream("s2")).toBeNull();
  });

  it("subscribe waits for Upstash to confirm before resolving", async () => {
    const { redis } = memoryRedis();
    const subscriber = upstashSubscriber(redis);
    const received: string[] = [];
    await subscriber.subscribe("ch", (m) => received.push(m));
    // Confirmed, so a publish right away is delivered, not lost.
    expect(await redis.publish("ch", "hello")).toBe(1);
    expect(received).toEqual(["hello"]);
  });
});

describe("redisResumableStreams (the chat:active pointer)", () => {
  it("start keeps the stream id for 5 minutes, and resume replays it", async () => {
    const { redis, raw } = memoryRedis();
    const streams = redisResumableStreams(redis);
    const started = streams.start("c1", "s1", slowStream(PARTS, 15));
    await new Promise((r) => setTimeout(r, 10));
    expect(raw.set).toHaveBeenCalledWith("chat:active:c1", "s1", {
      ex: ACTIVE_STREAM_TTL_S,
    });
    await started;
    const resumed = await streams.resume("c1");
    expect(await read(resumed!)).toBe(PARTS.join(""));
  });

  it("resume is null with no active stream", async () => {
    const { redis } = memoryRedis();
    expect(await redisResumableStreams(redis).resume("c1")).toBeNull();
  });

  it("finish forgets only its own stream, never a newer turn's", async () => {
    const { redis, store } = memoryRedis();
    const streams = redisResumableStreams(redis);
    store.set("chat:active:c1", "s2");
    await streams.finish("c1", "s1");
    expect(store.get("chat:active:c1")).toBe("s2");
    await streams.finish("c1", "s2");
    expect(store.has("chat:active:c1")).toBe(false);
  });

  it("never throws when Redis fails: the reply just can't be resumed", async () => {
    const broken = {
      set: async () => {
        throw new Error("down");
      },
      get: async () => {
        throw new Error("down");
      },
      eval: async () => {
        throw new Error("down");
      },
    } as unknown as Redis;
    const streams = redisResumableStreams(broken);
    await expect(
      streams.start("c1", "s1", slowStream(PARTS, 1)),
    ).resolves.toBeUndefined();
    await expect(streams.resume("c1")).resolves.toBeNull();
    await expect(streams.finish("c1", "s1")).resolves.toBeUndefined();
    expect(logEvent).toHaveBeenCalledWith("resumable_start_failed", {
      conversationId: "c1",
      streamId: "s1",
    });
  });
});
