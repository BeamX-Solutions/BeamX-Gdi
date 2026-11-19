import { afterAll, describe, expect, it } from "vitest";
import { db } from "../client";
import { toolRunAnswer } from "../schema";
import { eq } from "drizzle-orm";
import * as runs from "./runs";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

describe("answers and completion (AC-2, AC-4)", () => {
  it("saving the same question twice keeps one row with the latest value and source", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u, "stellar", "1", { q1: "first" });
    unwrap(await runs.saveAnswer(u, run.id, "q1", "second", "chat"));
    const rows = await db
      .select()
      .from(toolRunAnswer)
      .where(eq(toolRunAnswer.runId, run.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("second");
    expect(rows[0]?.source).toBe("chat");
  });

  it("refuses answers for another user's run or a completed run, changing nothing", async () => {
    const u = await t.guest();
    const other = await t.guest();
    const { run } = await runWithAnswers(u);
    const denied = await runs.saveAnswer(other, run.id, "q1", "hack", "client");
    expect(denied).toEqual({
      ok: false,
      error: { code: "not_found_or_not_in_progress" },
    });

    unwrap(await completeFromAnswers(u, run.id));
    const late = await runs.saveAnswer(u, run.id, "q3", "late", "client");
    expect(late.ok).toBe(false);
    const after = unwrap(await runs.get(u, run.id));
    expect(after.answers.map((a) => a.questionId).sort()).toEqual(["q1", "q2"]);
    expect(after.answers.find((a) => a.questionId === "q1")?.value).toBe("a");
  });

  it("completing is idempotent and creates exactly one pending report", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u);
    unwrap(await completeFromAnswers(u, run.id, { total: 7 }));
    const again = await completeFromAnswers(u, run.id, { total: 999 });
    expect(again.ok && again.value.scores).toEqual({ total: 7 });
    const snap = unwrap(await runs.get(u, run.id));
    expect(snap.report?.status).toBe("pending");
  });

  it("rejects scores computed from stale answers (answers_changed)", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u);
    const snap = unwrap(await runs.get(u, run.id));
    unwrap(await runs.saveAnswer(u, run.id, "q2", "changed", "client"));
    const stale = await runs.complete(
      u,
      run.id,
      { total: 1 },
      snap.run.answersVersion,
    );
    expect(stale).toEqual({ ok: false, error: { code: "answers_changed" } });
    expect(unwrap(await runs.get(u, run.id)).run.status).toBe("in_progress");
  });

  it("a late answer racing complete never lands in a completed run", async () => {
    for (let i = 0; i < 5; i++) {
      const u = await t.guest();
      const { run } = await runWithAnswers(u);
      const snap = unwrap(await runs.get(u, run.id));
      const [save, done] = await Promise.all([
        runs.saveAnswer(u, run.id, "q3", "late", "client"),
        runs.complete(u, run.id, { total: 1 }, snap.run.answersVersion),
      ]);
      const final = unwrap(await runs.get(u, run.id));
      const hasLate = final.answers.some((a) => a.questionId === "q3");
      if (final.run.status === "completed") {
        // complete won: the late answer must have been refused (or landed before and made complete stale, which is impossible here).
        expect(hasLate).toBe(false);
        expect(save.ok).toBe(false);
        expect(done.ok).toBe(true);
      } else {
        // the answer won: complete saw changed answers
        expect(hasLate).toBe(true);
        expect(done).toEqual({ ok: false, error: { code: "answers_changed" } });
      }
    }
  });
});
