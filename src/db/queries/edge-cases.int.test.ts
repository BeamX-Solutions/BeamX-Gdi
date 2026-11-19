import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../id";
import * as conversations from "./conversations";
import * as messages from "./messages";
import * as reports from "./reports";
import * as runs from "./runs";
import { guestTracker, runWithAnswers, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

const notFound = { ok: false, error: { code: "not_found" } };
const text = (s: string) => [{ type: "text", text: s }];

describe("malformed ids return typed errors, never a thrown 22P02 (AC-8)", () => {
  it("every user facing query answers not_found for a junk id", async () => {
    const u = await t.guest();
    for (const bad of ["abc", "", "123", "' OR 1=1 --"]) {
      expect(await conversations.get(u, bad)).toEqual(notFound);
      expect(await conversations.open(u, bad)).toEqual(notFound);
      expect(await conversations.ownerOf(bad)).toEqual(notFound);
      expect(await messages.append(u, bad, [])).toEqual(notFound);
      expect(await messages.listRecent(u, bad)).toEqual(notFound);
      expect(await runs.start(u, bad, "stellar", "1")).toEqual(notFound);
      expect(await runs.get(u, bad)).toEqual(notFound);
      expect(await runs.ownerOf(bad)).toEqual(notFound);
      expect(await runs.pause(u, bad)).toEqual(notFound);
      expect(await runs.resume(u, bad)).toEqual(notFound);
      expect(await runs.abandon(u, bad)).toEqual(notFound);
      expect(await runs.startFrom(u, bad, "1")).toEqual(notFound);
      expect(await runs.complete(u, bad, {}, 0)).toEqual(notFound);
      expect(await runs.saveAnswer(u, bad, "q1", "a", "client")).toEqual({
        ok: false,
        error: { code: "not_found_or_not_in_progress" },
      });
      expect(await reports.claim(u, bad)).toEqual(notFound);
      expect(await runs.getActive(u, bad)).toEqual({
        active: null,
        paused: [],
      });
    }
  });

  it("a list cursor with a bad timestamp or id is invalid_cursor", async () => {
    const u = await t.guest();
    const cursor = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    for (const bad of [
      cursor(["not a time", newId()]),
      cursor(["2026-02-31 00:00:00+00", newId()]),
      cursor(["2026-11-18 06:08:07+00", "nope"]),
    ])
      expect(await conversations.list(u, { cursor: bad })).toEqual({
        ok: false,
        error: { code: "invalid_cursor" },
      });
  });

  it("a real list cursor still pages", async () => {
    const u = await t.guest();
    await conversations.create(u);
    await conversations.create(u);
    const first = unwrap(await conversations.list(u, { limit: 1 }));
    expect(first.nextCursor).not.toBeNull();
    const second = unwrap(
      await conversations.list(u, { limit: 1, cursor: first.nextCursor ?? "" }),
    );
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });
});

describe("append with a repeated id", () => {
  it("saves the batch, keeping the last entry for the repeated id", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const id = newId();
    const written = unwrap(
      await messages.append(u, conv.id, [
        { id, role: "assistant", parts: text("partial") },
        { id: newId(), role: "user", parts: text("next") },
        { id, role: "assistant", parts: text("final") },
      ]),
    );
    expect(written).toBe(2);
    const page = unwrap(await messages.listRecent(u, conv.id));
    expect(page.messages.map((m) => m.parts)).toEqual([
      text("final"),
      text("next"),
    ]);
  });
});

describe("answers_version fingerprint (AC-4)", () => {
  it("every saved answer bumps the version, an update included", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u, "stellar", "1", {});
    expect(unwrap(await runs.get(u, run.id)).run.answersVersion).toBe(0);
    unwrap(await runs.saveAnswer(u, run.id, "q1", "a", "client"));
    unwrap(await runs.saveAnswer(u, run.id, "q1", "b", "client"));
    expect(unwrap(await runs.get(u, run.id)).run.answersVersion).toBe(2);
  });

  it("an update to an existing answer after the snapshot makes complete stale, whatever the commit order", async () => {
    // The review's case: same answer count, and an update that may carry an older
    // now() than another save. A count + max(updated_at) fingerprint could miss it.
    for (let i = 0; i < 3; i++) {
      const u = await t.guest();
      const { run } = await runWithAnswers(u);
      await Promise.all([
        runs.saveAnswer(u, run.id, "q1", "changed", "client"),
        runs.saveAnswer(u, run.id, "q2", "changed", "client"),
      ]);
      const snap = unwrap(await runs.get(u, run.id));
      unwrap(await runs.saveAnswer(u, run.id, "q1", "again", "client"));
      expect(
        await runs.complete(u, run.id, { total: 1 }, snap.run.answersVersion),
      ).toEqual({ ok: false, error: { code: "answers_changed" } });
      const fresh = unwrap(await runs.get(u, run.id));
      expect(
        unwrap(
          await runs.complete(
            u,
            run.id,
            { total: 1 },
            fresh.run.answersVersion,
          ),
        ).status,
      ).toBe("completed");
    }
  });

  it("startFrom copies answers into a run that starts at version 0", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u);
    const snap = unwrap(await runs.get(u, run.id));
    unwrap(await runs.complete(u, run.id, {}, snap.run.answersVersion));
    const next = unwrap(await runs.startFrom(u, run.id, "1"));
    expect(next.run.answersVersion).toBe(0);
    expect(unwrap(await runs.complete(u, next.run.id, {}, 0)).status).toBe(
      "completed",
    );
  });
});
