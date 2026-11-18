import { afterAll, describe, expect, it } from "vitest";
import * as reports from "./reports";
import * as runs from "./runs";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

describe("change my answers (AC-4, AC-9)", () => {
  it("startFrom copies answers with their sources and leaves the old run and report untouched", async () => {
    const u = await t.guest();
    const { conv, run } = await runWithAnswers(u, "stellar", "1", { q1: "a" });
    unwrap(await runs.saveAnswer(u, run.id, "q2", "from profile", "profile"));
    unwrap(await completeFromAnswers(u, run.id, { total: 5 }));
    unwrap(await reports.claim(u, run.id));
    unwrap(await reports.markReady(run.id, 1, { ok: true }, "m"));

    const next = unwrap(await runs.startFrom(u, run.id, "1"));
    expect(next.run.basedOnRunId).toBe(run.id);
    expect(next.run.status).toBe("in_progress");
    expect(next.run.conversationId).toBe(conv.id);
    const copied = unwrap(await runs.get(u, next.run.id)).answers;
    expect(copied.map((a) => [a.questionId, a.value, a.source]).sort()).toEqual(
      [
        ["q1", "a", "client"],
        ["q2", "from profile", "profile"],
      ],
    );

    // Edit the new run; the old one stays exactly as it was.
    unwrap(await runs.saveAnswer(u, next.run.id, "q1", "changed", "client"));
    const old = unwrap(await runs.get(u, run.id));
    expect(old.run.status).toBe("completed");
    expect(old.run.scores).toEqual({ total: 5 });
    expect(old.answers.find((a) => a.questionId === "q1")?.value).toBe("a");
    expect(old.report?.status).toBe("ready");
  });

  it("refuses bad starts with typed errors", async () => {
    const u = await t.guest();
    const other = await t.guest();
    const { run } = await runWithAnswers(u);
    expect(await runs.startFrom(u, run.id, "1")).toEqual({
      ok: false,
      error: { code: "previous_not_completed" },
    });
    unwrap(await completeFromAnswers(u, run.id));
    expect(await runs.startFrom(u, run.id, "2")).toEqual({
      ok: false,
      error: { code: "version_changed" },
    });
    expect(await runs.startFrom(other, run.id, "1")).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("startFrom pauses whatever is active in the chat", async () => {
    const u = await t.guest();
    const { conv, run } = await runWithAnswers(u);
    unwrap(await completeFromAnswers(u, run.id));
    const other = unwrap(await runs.start(u, conv.id, "luna", "1"));
    const next = unwrap(await runs.startFrom(u, run.id, "1"));
    expect(next.pausedRunId).toBe(other.run.id);
    const state = await runs.getActive(u, conv.id);
    expect(state.active?.run.id).toBe(next.run.id);
  });

  it("stores runs from any tool and version with no schema change (AC-9)", async () => {
    const u = await t.guest();
    const a = await runWithAnswers(u, "luna", "3");
    const b = await runWithAnswers(u, "brand-new-tool", "1.2.0");
    expect(unwrap(await runs.get(u, a.run.id)).run).toMatchObject({
      toolId: "luna",
      toolVersion: "3",
    });
    expect(unwrap(await runs.get(u, b.run.id)).run).toMatchObject({
      toolId: "brand-new-tool",
      toolVersion: "1.2.0",
    });
  });
});
