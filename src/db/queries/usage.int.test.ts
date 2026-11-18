import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { aiUsage } from "../schema";
import * as usage from "./usage";
import { guestTracker } from "../test/helpers";
import * as conversations from "./conversations";

const t = guestTracker();
const keys: string[] = [];
afterAll(async () => {
  await t.cleanup();
  for (const k of keys) await db.delete(aiUsage).where(eq(aiUsage.callKey, k));
});

const base = { purpose: "chat" as const, model: "m", costUsd: "0.001234" };

describe("usage.record (AC-7)", () => {
  it("is idempotent on callKey", async () => {
    const u = await t.guest();
    const callKey = `${newId()}:chat`;
    keys.push(callKey);
    const first = await usage.record({
      ...base,
      callKey,
      userId: u,
      inputTokens: 10,
    });
    const again = await usage.record({
      ...base,
      callKey,
      userId: u,
      inputTokens: 10,
    });
    expect(first.status).toBe("recorded");
    expect(again.status).toBe("duplicate");
    const rows = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.callKey, callKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costUsd).toBe("0.001234");
    expect(rows[0]?.inputTokens).toBe(10);
  });

  it("stores null links when the user or chat no longer exists, never an FK error", async () => {
    const callKey = `${newId()}:chat`;
    keys.push(callKey);
    const result = await usage.record({
      ...base,
      callKey,
      userId: newId(),
      conversationId: newId(),
      runId: newId(),
    });
    expect(result.status).toBe("recorded");
    const [row] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.callKey, callKey));
    expect(row?.userId).toBeNull();
    expect(row?.conversationId).toBeNull();
    expect(row?.runId).toBeNull();
  });

  it("links to a real user and chat", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const callKey = `${conv.id}:title`;
    keys.push(callKey);
    await usage.record({
      ...base,
      callKey,
      purpose: "title",
      userId: u,
      conversationId: conv.id,
    });
    const [row] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.callKey, callKey));
    expect(row?.userId).toBe(u);
    expect(row?.conversationId).toBe(conv.id);
  });
});
