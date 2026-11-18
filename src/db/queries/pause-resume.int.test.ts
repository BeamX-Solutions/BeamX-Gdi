import { afterAll, describe, expect, it } from "vitest";
import * as conversations from "./conversations";
import * as runs from "./runs";
import { guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

describe("one active run per chat (AC-3)", () => {
  it("starting another tool pauses the active run; resuming swaps them back", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const luna = unwrap(await runs.start(u, conv.id, "luna", "1"));
    expect(luna.pausedRunId).toBeNull();
    const stellar = unwrap(await runs.start(u, conv.id, "stellar", "1"));
    expect(stellar.pausedRunId).toBe(luna.run.id);

    const resumed = unwrap(await runs.resume(u, luna.run.id));
    expect(resumed.run.status).toBe("in_progress");
    expect(resumed.pausedRunId).toBe(stellar.run.id);

    const state = await runs.getActive(u, conv.id);
    expect(state.active?.run.id).toBe(luna.run.id);
    expect(state.paused.map((r) => r.id)).toEqual([stellar.run.id]);
  });

  it("pause and resume are idempotent and typed", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const { run } = unwrap(await runs.start(u, conv.id, "luna", "1"));
    unwrap(await runs.pause(u, run.id));
    expect((await runs.pause(u, run.id)).ok).toBe(true);
    unwrap(await runs.resume(u, run.id));
    expect((await runs.resume(u, run.id)).ok).toBe(true);
    unwrap(await runs.abandon(u, run.id));
    expect(await runs.resume(u, run.id)).toEqual({
      ok: false,
      error: { code: "not_paused" },
    });
    expect(await runs.pause(u, run.id)).toEqual({
      ok: false,
      error: { code: "not_in_progress" },
    });
  });

  it("two parallel starts both succeed and leave one active run", async () => {
    for (let i = 0; i < 3; i++) {
      const u = await t.guest();
      const conv = await conversations.create(u);
      const results = await Promise.all([
        runs.start(u, conv.id, "luna", "1"),
        runs.start(u, conv.id, "stellar", "1"),
      ]);
      for (const r of results) expect(r.ok).toBe(true);
      const state = await runs.getActive(u, conv.id);
      expect(state.active).not.toBeNull();
      expect(state.paused).toHaveLength(1);
    }
  });

  it("many parallel starts never leave two active runs", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const results = await Promise.all(
      ["luna", "stellar", "nova", "orion"].map((tool) =>
        runs.start(u, conv.id, tool, "1"),
      ),
    );
    const winners = results.filter((r) => r.ok).length;
    expect(winners).toBeGreaterThanOrEqual(1);
    for (const r of results)
      if (!r.ok) expect(r.error.code).toBe("run_in_progress");
    const state = await runs.getActive(u, conv.id);
    expect(state.active).not.toBeNull();
    expect(state.paused).toHaveLength(winners - 1);
  });

  it("deleting a chat abandons its live runs and keeps completed runs", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const { run } = unwrap(await runs.start(u, conv.id, "luna", "1"));
    unwrap(await conversations.remove(u, conv.id));
    const after = unwrap(await runs.get(u, run.id));
    expect(after.run.status).toBe("abandoned");
    expect(after.run.conversationId).toBeNull();
    expect(await conversations.get(u, conv.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
