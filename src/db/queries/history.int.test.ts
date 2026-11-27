/**
 * Feature #14: the history rail's page, newest first, keyset paged, with each chat's
 * first user message and its ready reports.
 */
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import * as conversations from "./conversations";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

const touch = (id: string, at: string) =>
  db.execute(
    sql`UPDATE conversation SET last_message_at = ${at}::timestamptz WHERE id = ${id}::uuid`,
  );

describe("conversations.history (feature #14)", () => {
  it("lists the user's chats newest first, with ready report tools, paged", async () => {
    const u = await t.guest();
    const other = await t.guest();
    const a = await conversations.create(u);
    const { conv: b, run } = await runWithAnswers(u);
    unwrap(await completeFromAnswers(u, run.id));
    await db.execute(
      sql`UPDATE report SET status = 'ready', content = '{}'::jsonb, attempts = 1 WHERE run_id = ${run.id}::uuid`,
    );
    await conversations.create(other);
    await touch(a.id, "2026-11-20 10:00:00+00");
    await touch(b.id, "2026-11-21 10:00:00+00");

    const first = unwrap(await conversations.history(u, { limit: 1 }));
    expect(first.items.map((c) => c.id)).toEqual([b.id]);
    expect(first.items[0]?.readyToolIds).toEqual(["stellar"]);
    expect(first.nextCursor).not.toBeNull();

    const second = unwrap(
      await conversations.history(u, {
        limit: 1,
        cursor: first.nextCursor ?? "",
      }),
    );
    expect(second.items.map((c) => c.id)).toEqual([a.id]);
    expect(second.items[0]?.readyToolIds).toEqual([]);
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a bad cursor", async () => {
    const u = await t.guest();
    expect(await conversations.history(u, { cursor: "nope" })).toEqual({
      ok: false,
      error: { code: "invalid_cursor" },
    });
  });
});
