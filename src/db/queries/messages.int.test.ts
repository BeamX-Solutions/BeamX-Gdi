import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../id";
import * as conversations from "./conversations";
import * as messages from "./messages";
import { guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

const text = (s: string) => [{ type: "text", text: s }];

describe("messages (AC-1, AC-8, AC-10)", () => {
  it("re-appending the same id updates the parts; order follows insert order", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const id = newId();
    unwrap(
      await messages.append(u, conv.id, [
        { id, role: "user", parts: text("v1") },
        { id: newId(), role: "assistant", parts: text("reply") },
      ]),
    );
    unwrap(
      await messages.append(u, conv.id, [
        { id, role: "user", parts: text("v2"), metadata: { edited: true } },
      ]),
    );
    const page = unwrap(await messages.listRecent(u, conv.id));
    expect(page.messages).toHaveLength(2);
    expect(page.messages[0]?.id).toBe(id);
    expect(page.messages[0]?.parts).toEqual(text("v2"));
    expect(page.messages[0]?.metadata).toEqual({ edited: true });
    expect(page.messages[1]?.role).toBe("assistant");
  });

  it("an id from another conversation is never touched", async () => {
    const u = await t.guest();
    const a = await conversations.create(u);
    const b = await conversations.create(u);
    const id = newId();
    unwrap(
      await messages.append(u, a.id, [
        { id, role: "user", parts: text("mine") },
      ]),
    );
    unwrap(
      await messages.append(u, b.id, [
        { id, role: "user", parts: text("overwrite") },
      ]),
    );
    const inA = unwrap(await messages.listRecent(u, a.id));
    const inB = unwrap(await messages.listRecent(u, b.id));
    expect(inA.messages[0]?.parts).toEqual(text("mine"));
    expect(inB.messages).toHaveLength(0);
  });

  it("a user message reusing an assistant message id never overwrites it", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const id = newId();
    unwrap(
      await messages.append(u, conv.id, [
        { id, role: "assistant", parts: text("server card") },
      ]),
    );
    const written = unwrap(
      await messages.append(u, conv.id, [
        { id, role: "user", parts: text("forged") },
      ]),
    );
    const page = unwrap(await messages.listRecent(u, conv.id));
    expect(written).toBe(0);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.role).toBe("assistant");
    expect(page.messages[0]?.parts).toEqual(text("server card"));
  });

  it("another user cannot append to or read a conversation", async () => {
    const u = await t.guest();
    const other = await t.guest();
    const conv = await conversations.create(u);
    const denied = await messages.append(other, conv.id, [
      { id: newId(), role: "user", parts: text("x") },
    ]);
    expect(denied).toEqual({ ok: false, error: { code: "not_found" } });
    expect((await messages.listRecent(other, conv.id)).ok).toBe(false);
    expect(unwrap(await messages.listRecent(u, conv.id)).messages).toHaveLength(
      0,
    );
  });

  it("paginates by seq with opaque cursors, oldest first within each page", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const ids = Array.from({ length: 5 }, () => newId());
    unwrap(
      await messages.append(
        u,
        conv.id,
        ids.map((id, i) => ({
          id,
          role: "user" as const,
          parts: text(`m${i}`),
        })),
      ),
    );
    const first = unwrap(await messages.listRecent(u, conv.id, undefined, 2));
    expect(first.messages.map((m) => m.id)).toEqual([ids[3], ids[4]]);
    expect(first.nextCursor).not.toBeNull();
    const second = unwrap(
      await messages.listRecent(u, conv.id, first.nextCursor ?? undefined, 2),
    );
    expect(second.messages.map((m) => m.id)).toEqual([ids[1], ids[2]]);
    const third = unwrap(
      await messages.listRecent(u, conv.id, second.nextCursor ?? undefined, 2),
    );
    expect(third.messages.map((m) => m.id)).toEqual([ids[0]]);
    expect(third.nextCursor).toBeNull();
    expect(await messages.listRecent(u, conv.id, "not-a-cursor")).toEqual({
      ok: false,
      error: { code: "invalid_cursor" },
    });
  });

  it("appending bumps last_message_at, so the sidebar list is newest first", async () => {
    const u = await t.guest();
    const older = await conversations.create(u);
    const newer = await conversations.create(u);
    unwrap(
      await messages.append(u, older.id, [
        { id: newId(), role: "user", parts: text("bump") },
      ]),
    );
    const list = unwrap(await conversations.list(u, { limit: 1 }));
    expect(list.items[0]?.id).toBe(older.id);
    expect(list.nextCursor).not.toBeNull();
    const next = unwrap(
      await conversations.list(u, {
        limit: 1,
        cursor: list.nextCursor ?? undefined,
      }),
    );
    expect(next.items[0]?.id).toBe(newer.id);
    expect(next.nextCursor).toBeNull();
  });
});
