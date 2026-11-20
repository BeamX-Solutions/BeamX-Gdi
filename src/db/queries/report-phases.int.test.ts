import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { creditHold, report } from "../schema";
import * as reports from "./reports";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

// Spec 0005, build plan task 4: savePhase, status and failStale.

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

const holdStatus = async (runId: string) => {
  const rows = await db
    .select({ status: creditHold.status })
    .from(creditHold)
    .where(and(eq(creditHold.runId, runId), eq(creditHold.purpose, "run")));
  return rows[0]?.status;
};

/** Claims and fails until the third attempt is generating. */
const onLastAttempt = async (u: string, runId: string) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    unwrap(await reports.claim(u, runId));
    unwrap(
      await reports.markFailed(runId, attempt, {
        kind: "timeout",
        message: "Took too long",
      }),
    );
  }
  unwrap(await reports.claim(u, runId));
};

describe("reports.savePhase (AC-8)", () => {
  it("merges each phase output under its key, fenced by attempt", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));

    unwrap(await reports.savePhase(runId, 1, "one", { a: 1 }));
    unwrap(await reports.savePhase(runId, 1, "two", ["x", "y"]));

    const [row] = await db.select().from(report).where(eq(report.runId, runId));
    expect(row?.content).toEqual({ one: { a: 1 }, two: ["x", "y"] });
    expect(row?.status).toBe("generating");
  });

  it("refuses a stale attempt and a report that is not generating", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));
    expect(await reports.savePhase(runId, 2, "one", {})).toEqual({
      ok: false,
      error: { code: "stale_attempt" },
    });

    unwrap(
      await reports.markFailed(runId, 1, { kind: "unknown", message: "x" }),
    );
    expect((await reports.savePhase(runId, 1, "one", {})).ok).toBe(false);
  });

  it("keeps saved phases across a retry", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));
    unwrap(await reports.savePhase(runId, 1, "one", { a: 1 }));
    unwrap(
      await reports.markFailed(runId, 1, { kind: "unknown", message: "x" }),
    );
    unwrap(await reports.claim(u, runId));
    unwrap(await reports.savePhase(runId, 2, "two", { b: 2 }));
    const status = unwrap(await reports.status(u, runId));
    expect(status.phaseKeys).toEqual(["one", "two"]);
  });
});

describe("reports.status (AC-10)", () => {
  it("returns the light status row for the owner", async () => {
    const { u, runId } = await completedRun();
    const pending = unwrap(await reports.status(u, runId));
    expect(pending).toMatchObject({
      toolId: "stellar",
      toolVersion: "1",
      status: "pending",
      attempts: 0,
      error: null,
      phaseKeys: [],
      hasHold: true,
      stale: false,
    });
    expect(typeof pending.updatedAt).toBe("string");

    unwrap(await reports.claim(u, runId));
    unwrap(await reports.savePhase(runId, 1, "analysis", { long: "x" }));
    const generating = unwrap(await reports.status(u, runId));
    expect(generating).toMatchObject({
      status: "generating",
      attempts: 1,
      phaseKeys: ["analysis"],
      stale: false,
    });

    await age(runId);
    expect(unwrap(await reports.status(u, runId)).stale).toBe(true);
  });

  it("returns the stored error of a failed report", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));
    unwrap(
      await reports.markFailed(runId, 1, {
        kind: "provider_overloaded",
        message: "Busy",
      }),
    );
    expect(unwrap(await reports.status(u, runId))).toMatchObject({
      status: "failed",
      error: { kind: "provider_overloaded", message: "Busy" },
    });
  });

  it("is not_found for another user, an unknown run, or a run with no report", async () => {
    const { runId } = await completedRun();
    const other = await t.guest();
    expect(await reports.status(other, runId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect((await reports.status(other, crypto.randomUUID())).ok).toBe(false);

    const u = await t.guest();
    const { run } = await runWithAnswers(u);
    expect((await reports.status(u, run.id)).ok).toBe(false);
  });
});

describe("reports.failStale (AC-15)", () => {
  it("fails a stale last attempt as timeout and releases the hold", async () => {
    const { u, runId } = await completedRun();
    await onLastAttempt(u, runId);
    await age(runId);

    expect(await reports.failStale(u, runId)).toEqual({ failed: true });
    expect(unwrap(await reports.status(u, runId))).toMatchObject({
      status: "failed",
      attempts: 3,
      error: { kind: "timeout" },
      hasHold: false,
    });
    expect(await holdStatus(runId)).toBe("released");
  });

  it("changes nothing when the last attempt is not stale yet", async () => {
    const { u, runId } = await completedRun();
    await onLastAttempt(u, runId);
    expect(await reports.failStale(u, runId)).toEqual({ failed: false });
    expect(unwrap(await reports.status(u, runId)).status).toBe("generating");
    expect(await holdStatus(runId)).toBe("active");
  });

  it("changes nothing on a stale report with attempts left", async () => {
    const { u, runId } = await completedRun();
    unwrap(await reports.claim(u, runId));
    await age(runId);
    expect(await reports.failStale(u, runId)).toEqual({ failed: false });
    expect(await holdStatus(runId)).toBe("active");
  });

  it("changes nothing for another user's run", async () => {
    const { u, runId } = await completedRun();
    await onLastAttempt(u, runId);
    await age(runId);
    const other = await t.guest();
    expect(await reports.failStale(other, runId)).toEqual({ failed: false });
    expect(await holdStatus(runId)).toBe("active");
  });
});
