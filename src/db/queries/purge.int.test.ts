import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

// Spec 0009, AC-14: the daily purge deletes guests idle for more than 30 days with
// everything they own, logs the credits they forfeited, and never deletes a recent
// guest, a guest with work in flight, or a verified account. Runs on the Neon test
// branch; other files' guests are fresh, so the purge never touches them.

const { events } = vi.hoisted(() => ({
  events: [] as { event: string; fields: Record<string, unknown> }[],
}));
vi.mock("@/lib/log", () => ({
  logEvent: (event: string, fields: Record<string, unknown>) => {
    events.push({ event, fields });
  },
}));

const { db } = await import("../client");
const { newId } = await import("../id");
const { conversation, creditAccount, toolRun, user } =
  await import("../schema");
const conversations = await import("./conversations");
const credits = await import("./credits");
const runs = await import("./runs");
const { purgeUsers } = await import("./users");
const { guestTracker, runWithAnswers, unwrap } =
  await import("../test/helpers");

const t = guestTracker();
const accounts: string[] = [];
afterAll(async () => {
  await t.cleanup();
  for (const id of accounts) await db.delete(user).where(eq(user.id, id));
});

/** Moves every activity timestamp of a user `days` into the past. */
const idleFor = async (userId: string, days: number) => {
  const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const iso = then.toISOString();
  await db.batch([
    db.update(user).set({ updatedAt: then }).where(eq(user.id, userId)),
    db
      .update(conversation)
      .set({ updatedAt: iso })
      .where(eq(conversation.userId, userId)),
    db
      .update(toolRun)
      .set({ updatedAt: iso })
      .where(eq(toolRun.userId, userId)),
  ]);
};

/** A guest with a chat, an unfunded run and a credit balance, but nothing in flight. */
const guestWithWork = async () => {
  const id = await t.guest();
  await credits.ensureAccount(id, 100);
  const conv = await conversations.create(id);
  unwrap(await runs.start(id, conv.id, "stellar", "1"));
  return id;
};

const exists = async (id: string) =>
  (await db.select({ id: user.id }).from(user).where(eq(user.id, id))).length >
  0;

describe("purgeUsers (spec 0009, AC-14)", () => {
  it("stops when the time budget is spent and leaves the guest for the next day", async () => {
    const stale = await guestWithWork();
    await idleFor(stale, 31);
    const clock = [0, 200_000];
    const summary = await purgeUsers(() => clock.shift() ?? 200_000);
    expect(summary).toMatchObject({ batches: 0, complete: false });
    expect(await exists(stale)).toBe(true);
  });

  it("deletes stale guests with everything they own and keeps the rest", async () => {
    const stale = await guestWithWork();
    await idleFor(stale, 31);
    const recent = await guestWithWork();
    await idleFor(recent, 29);
    // An active credit hold: a run in flight.
    const held = await t.guest();
    await runWithAnswers(held);
    await idleFor(held, 31);
    // A verified account idle just as long.
    const verified = newId();
    accounts.push(verified);
    await db.insert(user).values({
      id: verified,
      name: "Ada",
      email: `${verified}@purge.test`,
      emailVerified: true,
      isAnonymous: false,
    });
    await idleFor(verified, 31);
    // A recent session keeps a guest whose rows are old.
    const signedInRecently = await guestWithWork();
    await idleFor(signedInRecently, 31);
    await db.execute(sql`
      INSERT INTO session (id, token, expires_at, created_at, updated_at, user_id)
      VALUES (${newId()}::uuid, ${newId()}, now() + interval '1 day', now(), now(),
        ${signedInRecently}::uuid)
    `);

    events.length = 0;
    const summary = await purgeUsers();

    expect(await exists(stale)).toBe(false);
    expect(
      await db
        .select()
        .from(conversation)
        .where(eq(conversation.userId, stale)),
    ).toEqual([]);
    expect(
      await db.select().from(toolRun).where(eq(toolRun.userId, stale)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(creditAccount)
        .where(eq(creditAccount.userId, stale)),
    ).toEqual([]);
    for (const kept of [recent, held, verified, signedInRecently])
      expect(await exists(kept)).toBe(true);

    expect(summary.complete).toBe(true);
    expect(summary.deleted).toBeGreaterThanOrEqual(1);
    expect(summary.forfeitedCredits).toBeGreaterThanOrEqual(100);
    expect(events).toContainEqual({ event: "guests_purged", fields: summary });
  });
});
