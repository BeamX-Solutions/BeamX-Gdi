import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { report, toolRun } from "../schema";
import * as reports from "./reports";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

const completedRun = async () => {
  const u = await t.guest();
  const { run } = await runWithAnswers(u);
  unwrap(await completeFromAnswers(u, run.id));
  return { u, runId: run.id };
};

const age = (runId: string) =>
  db
    .update(report)
    .set({ updatedAt: sql`now() - interval '11 minutes'` })
    .where(eq(report.runId, runId));

describe("report lifecycle (AC-5)", () => {
  it("two parallel claims have exactly one winner", async () => {
    const { u, runId } = await completedRun();
    const results = await Promise.all([
      reports.claim(u, runId),
      reports.claim(u, runId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser && !loser.ok && loser.error.code).toBe("already_generating");
  });

  it("failed can be retried, stale generating can be reclaimed, and the old attempt is dropped", async () => {
    const { u, runId } = await completedRun();
    const first = unwrap(await reports.claim(u, runId));
    expect(first.attempts).toBe(1);

    unwrap(
      await reports.markFailed(runId, 1, {
        kind: "timeout",
        message: "Took too long",
      }),
    );
    const second = unwrap(await reports.claim(u, runId));
    expect(second.attempts).toBe(2);

    // Not stale yet: a third claim is refused.
    expect((await reports.claim(u, runId)).ok).toBe(false);
    await age(runId);
    const third = unwrap(await reports.claim(u, runId));
    expect(third.attempts).toBe(3);

    // The reclaimed (older) attempt can no longer write.
    expect(await reports.markReady(runId, 2, { x: 1 }, "m")).toEqual({
      ok: false,
      error: { code: "stale_attempt" },
    });
    expect(
      (await reports.markFailed(runId, 2, { kind: "unknown", message: "x" }))
        .ok,
    ).toBe(false);
    expect((await reports.markReady(runId, 3, { x: 1 }, "m")).ok).toBe(true);
  });

  it("a fourth attempt is refused, and a failed report still leaves scores readable", async () => {
    const { u, runId } = await completedRun();
    for (let attempt = 1; attempt <= 3; attempt++) {
      unwrap(await reports.claim(u, runId));
      unwrap(
        await reports.markFailed(runId, attempt, {
          kind: "provider_overloaded",
          message: "Busy",
        }),
      );
    }
    expect(await reports.claim(u, runId)).toEqual({
      ok: false,
      error: { code: "attempts_exhausted" },
    });
    const [row] = await db.select().from(toolRun).where(eq(toolRun.id, runId));
    expect(row?.scores).toEqual({ total: 1 });
  });

  it("ready is final: claiming again returns already_ready", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));
    unwrap(await reports.markReady(runId, 1, { ok: true }, "m"));
    expect(await reports.claim(u, runId)).toEqual({
      ok: false,
      error: { code: "already_ready" },
    });
  });
});
