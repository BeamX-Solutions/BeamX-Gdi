import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { aiUsage, user } from "../schema";
import { linkGuestAccount } from "@/auth/link";
import * as conversations from "./conversations";
import * as messages from "./messages";
import * as reports from "./reports";
import * as runs from "./runs";
import * as usage from "./usage";
import {
  LINKED_TABLES,
  LINK_EXCLUDED_TABLES,
  deleteAccount,
  linkGuest,
} from "./users";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
const usageKeys: string[] = [];
afterAll(async () => {
  await t.cleanup();
  for (const k of usageKeys)
    await db.delete(aiUsage).where(eq(aiUsage.callKey, k));
});

const record = async (
  userId: string,
  conversationId: string,
  runId?: string,
) => {
  const callKey = `${newId()}:chat`;
  usageKeys.push(callKey);
  await usage.record({
    callKey,
    userId,
    conversationId,
    runId,
    purpose: "chat",
    model: "m",
    costUsd: 0.01,
  });
  return callKey;
};

describe("guest to account (AC-6)", () => {
  it("moves every row the guest owns to the new user, and is idempotent", async () => {
    const guest = await t.guest();
    const account = await t.guest();
    const { conv, run } = await runWithAnswers(guest);
    unwrap(
      await messages.append(guest, conv.id, [
        { id: newId(), role: "user", parts: [] },
      ]),
    );
    unwrap(await completeFromAnswers(guest, run.id));
    await record(guest, conv.id, run.id);

    const counts = await linkGuest(guest, account);
    expect(counts).toEqual({ conversation: 1, toolRun: 1, aiUsage: 1 });

    // The new user now owns it all; the old guest owns nothing.
    expect(unwrap(await conversations.get(account, conv.id)).userId).toBe(
      account,
    );
    expect(unwrap(await runs.get(account, run.id)).run.userId).toBe(account);
    expect(await conversations.get(guest, conv.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    // The report is reachable through the moved run.
    expect(unwrap(await reports.claim(account, run.id)).attempts).toBe(1);

    expect(await linkGuest(guest, account)).toEqual({
      conversation: 0,
      toolRun: 0,
      aiUsage: 0,
    });
  });

  it("a failed move aborts everything: the hook throws and the guest keeps their data", async () => {
    const guest = await t.guest();
    const { conv, run } = await runWithAnswers(guest);
    const missingUser = newId(); // no such user: the foreign key rejects the batch
    await expect(
      linkGuestAccount({
        anonymousUser: { user: { id: guest } },
        newUser: { user: { id: missingUser } },
      }),
    ).rejects.toThrow();

    const [stillGuest] = await db.select().from(user).where(eq(user.id, guest));
    expect(stillGuest).toBeDefined();
    expect(unwrap(await conversations.get(guest, conv.id)).userId).toBe(guest);
    expect(unwrap(await runs.get(guest, run.id)).run.userId).toBe(guest);
  });

  it("the hook moves rows for a real link", async () => {
    const guest = await t.guest();
    const account = await t.guest();
    const { conv } = await runWithAnswers(guest);
    await linkGuestAccount({
      anonymousUser: { user: { id: guest } },
      newUser: { user: { id: account } },
    });
    expect(unwrap(await conversations.get(account, conv.id)).userId).toBe(
      account,
    );
  });

  it("a usage record or message finishing after the link lands on the right owner", async () => {
    const guest = await t.guest();
    const account = await t.guest();
    const { conv, run } = await runWithAnswers(guest);
    await linkGuest(guest, account);
    // Better Auth deletes the anonymous user once the hook returns.
    await deleteAccount(guest);

    // onFinish and the report step resolve the owner at write time, not from the session.
    const owner = unwrap(await conversations.ownerOf(conv.id));
    expect(owner).toBe(account);
    expect(unwrap(await runs.ownerOf(run.id))).toBe(account);
    unwrap(
      await messages.append(owner, conv.id, [
        { id: newId(), role: "assistant", parts: [] },
      ]),
    );
    const key = await record(owner, conv.id);
    const [saved] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.callKey, key));
    expect(saved?.userId).toBe(account);
  });

  it("the stale guest id is the wrong owner after a link, which is why ownerOf exists", async () => {
    const guest = await t.guest();
    const account = await t.guest();
    const { conv } = await runWithAnswers(guest);
    await linkGuest(guest, account);
    await deleteAccount(guest);

    expect(
      await messages.append(guest, conv.id, [
        { id: newId(), role: "assistant", parts: [] },
      ]),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await conversations.ownerOf(newId())).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await runs.ownerOf(newId())).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("every user owned table is covered (AC-6, AC-7)", () => {
  it("each foreign key to user.id is linked or excluded on purpose, with a delete rule", async () => {
    const result = await db.execute(sql`
      SELECT c.conrelid::regclass::text AS tbl, c.confdeltype AS del
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'public."user"'::regclass
    `);
    const fks = result.rows as { tbl: string; del: string }[];
    expect(fks.length).toBeGreaterThan(0);
    const known: readonly string[] = [
      ...LINKED_TABLES,
      ...LINK_EXCLUDED_TABLES,
    ];
    for (const fk of fks) {
      expect(
        known,
        `table "${fk.tbl}" is neither linked nor excluded`,
      ).toContain(fk.tbl);
      // 'c' = cascade, 'n' = set null. Anything else would block deleting a user.
      expect(["c", "n"], `table "${fk.tbl}" delete rule`).toContain(fk.del);
    }
    for (const table of LINKED_TABLES)
      expect(fks.map((f) => f.tbl)).toContain(table);
  });
});

describe("deleting a user (AC-7)", () => {
  it("removes every owned row by cascade and keeps ai_usage with a null user", async () => {
    const u = await t.guest();
    const { conv, run } = await runWithAnswers(u);
    unwrap(
      await messages.append(u, conv.id, [
        { id: newId(), role: "user", parts: [] },
      ]),
    );
    unwrap(await completeFromAnswers(u, run.id));
    const key = await record(u, conv.id, run.id);

    expect(await deleteAccount(u)).toBe(true);
    expect(await deleteAccount(u)).toBe(false);

    const count = async (table: string, col: string, id: string) => {
      const r = await db.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} = ${id}::uuid`,
      );
      return (r.rows[0] as { n: number }).n;
    };
    expect(await count("conversation", "user_id", u)).toBe(0);
    expect(await count("message", "conversation_id", conv.id)).toBe(0);
    expect(await count("tool_run", "user_id", u)).toBe(0);
    expect(await count("tool_run_answer", "run_id", run.id)).toBe(0);
    expect(await count("report", "run_id", run.id)).toBe(0);

    const [kept] = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.callKey, key));
    expect(kept).toBeDefined();
    expect(kept?.userId).toBeNull();
  });
});
