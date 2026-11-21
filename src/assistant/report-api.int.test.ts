import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { db } from "@/db/client";
import * as reports from "@/db/queries/reports";
import { creditHold, report } from "@/db/schema";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "@/db/test/helpers";
import { makeRegistry } from "@/tools/_kit/registry";
import { threePhaseTool } from "@/tools/test-tools/three-phase";
import type { ToolModule, ToolReader } from "@/tools/registry";
import { reportApiDeps, reportDeps } from "./report-deps";
import {
  getReport,
  postReport,
  type ApiResponse,
  type ReportApiDeps,
  type Schedule,
} from "./report-api";

// Spec 0005, build plan task 6: the report routes' logic against a real branch, with
// the AI SDK mock model and a registry holding the three phase test tool.

const t = guestTracker();
afterAll(t.cleanup);

type Reply = { readonly text: string } | { readonly throws: unknown };

const step = (text: string): Reply => ({ text: JSON.stringify({ text }) });
const overloaded: Reply = {
  throws: new APICallError({
    message: "Overloaded",
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode: 529,
    isRetryable: false,
  }),
};

/** A mock model answering from a script; `calls` counts every model call. */
const scripted = (replies: readonly Reply[]) => {
  const state = { calls: 0 };
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const reply = replies[state.calls] ?? replies.at(-1);
      state.calls += 1;
      if (!reply) throw new Error("no reply scripted");
      if ("throws" in reply) throw reply.throws;
      return {
        content: [{ type: "text" as const, text: reply.text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 100,
            noCache: 100,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, state };
};

/** The version 0 read side of the test tool: same shape, its own view. */
const oldReader: ToolReader = {
  questions: threePhaseTool.questions,
  scoresSchema: threePhaseTool.scoresSchema,
  contentSchema: threePhaseTool.contentSchema,
  toView: () => [{ kind: "text", title: "Old report", paragraphs: ["v0"] }],
};
const tool: ToolModule = { ...threePhaseTool, readers: { "0": oldReader } };
const registry = makeRegistry([tool]);

const depsWith = (replies: readonly Reply[]) => {
  const { model, state } = scripted(replies);
  const deps: ReportApiDeps = {
    ...reportApiDeps,
    getTool: registry.getTool,
    getReader: registry.getReader,
    runner: {
      ...reportDeps,
      getTool: registry.getTool,
      model: () => ({ id: "claude-opus-5-5", model }),
      log: () => {},
    },
    log: () => {},
  };
  return { deps, state };
};

/** Collects the work `after()` would run, so a test can run it when it chooses. */
const collector = () => {
  const tasks: (() => Promise<unknown>)[] = [];
  const schedule: Schedule = (task) => {
    tasks.push(task);
  };
  const runAll = async () => {
    const pending = tasks.splice(0);
    for (const task of pending) await task();
  };
  return { tasks, schedule, runAll };
};

const completedRun = async (version = "1") => {
  const u = await t.guest();
  const { run } = await runWithAnswers(u, "three-phase", version, {
    goal: "grow",
  });
  unwrap(await completeFromAnswers(u, run.id, {}));
  return { u, runId: run.id };
};

const holdStatus = async (runId: string) => {
  const rows = await db
    .select({ status: creditHold.status })
    .from(creditHold)
    .where(and(eq(creditHold.runId, runId), eq(creditHold.purpose, "run")));
  return rows[0]?.status;
};

const reportRow = async (runId: string) => {
  const [row] = await db.select().from(report).where(eq(report.runId, runId));
  return row;
};

const age = (runId: string) =>
  db
    .update(report)
    .set({ updatedAt: sql`now() - interval '11 minutes'` })
    .where(eq(report.runId, runId));

const body = (r: ApiResponse) => r.body as Record<string, unknown>;

const goodReplies = [step("a"), step("b"), step("c")];
const content = {
  one: { text: "a" },
  two: { text: "b" },
  three: { text: "c" },
};

describe("POST and GET report: happy path (AC-7, AC-8, AC-10)", () => {
  it("claims, runs every phase after the response, charges, and shows the view", async () => {
    const { u, runId } = await completedRun();
    const { deps, state } = depsWith(goodReplies);
    const after = collector();

    const posted = await postReport(deps, { userId: u, runId }, after.schedule);
    expect(posted.status).toBe(202);
    expect(posted.body).toMatchObject({
      status: "generating",
      canRetry: false,
      error: null,
      phases: [
        { label: "Step one", done: false },
        { label: "Step two", done: false },
        { label: "Step three", done: false },
      ],
    });
    // Nothing runs before the response is sent.
    expect(state.calls).toBe(0);
    expect(after.tasks).toHaveLength(1);

    await after.runAll();
    expect(state.calls).toBe(3);
    expect(await holdStatus(runId)).toBe("charged");

    const got = await getReport(deps, { userId: u, runId });
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({
      status: "ready",
      error: null,
      phases: [
        { label: "Step one", done: true },
        { label: "Step two", done: true },
        { label: "Step three", done: true },
      ],
      view: [{ kind: "bullets", title: "Steps", items: ["a", "b", "c"] }],
      // The chip's numbers ride on the poll; the charge cleared the hold (spec 0007).
      summary: { available: expect.any(Number), held: 0 },
    });

    // A failed summary read only leaves the summary out.
    const noSummary = await getReport(
      {
        ...deps,
        summary: async () => {
          throw new Error("db down");
        },
      },
      { userId: u, runId },
    );
    expect(noSummary.status).toBe(200);
    expect(body(noSummary)).not.toHaveProperty("summary");
    expect(body(noSummary)).toMatchObject({ status: "ready" });

    // A POST on a ready report changes nothing.
    const again = await postReport(deps, { userId: u, runId }, after.schedule);
    expect(again.status).toBe(200);
    expect(after.tasks).toHaveLength(0);
  });
});

describe("POST report: guards (AC-7)", () => {
  it("makes one claim and one set of AI calls for two concurrent POSTs", async () => {
    const { u, runId } = await completedRun();
    const { deps, state } = depsWith(goodReplies);
    const after = collector();

    const [a, b] = await Promise.all([
      postReport(deps, { userId: u, runId }, after.schedule),
      postReport(deps, { userId: u, runId }, after.schedule),
    ]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(after.tasks).toHaveLength(1);
    await after.runAll();
    expect(state.calls).toBe(3);
    expect((await reportRow(runId))?.attempts).toBe(1);
  });

  it("returns 404 for another user's run and changes nothing", async () => {
    const { runId } = await completedRun();
    const stranger = await t.guest();
    const { deps } = depsWith(goodReplies);
    const after = collector();

    const posted = await postReport(
      deps,
      { userId: stranger, runId },
      after.schedule,
    );
    expect(posted).toEqual({ status: 404, body: { code: "not_found" } });
    expect(await getReport(deps, { userId: stranger, runId })).toEqual({
      status: 404,
      body: { code: "not_found" },
    });
    expect(after.tasks).toHaveLength(0);
    expect((await reportRow(runId))?.attempts).toBe(0);
  });

  it("returns 404 for a run that is not completed yet", async () => {
    const u = await t.guest();
    const { run } = await runWithAnswers(u, "three-phase", "1", {
      goal: "grow",
    });
    const { deps } = depsWith(goodReplies);
    const posted = await postReport(
      deps,
      { userId: u, runId: run.id },
      collector().schedule,
    );
    expect(posted.status).toBe(404);
  });

  it("refuses an old version with 409 version_changed, using no attempt and keeping the hold", async () => {
    const { u, runId } = await completedRun("0");
    const { deps, state } = depsWith(goodReplies);
    const after = collector();

    const posted = await postReport(deps, { userId: u, runId }, after.schedule);
    expect(posted.status).toBe(409);
    expect(body(posted).code).toBe("version_changed");
    expect(body(posted).error).toMatchObject({ kind: "version_changed" });
    expect(after.tasks).toHaveLength(0);
    expect(state.calls).toBe(0);
    expect((await reportRow(runId))?.attempts).toBe(0);
    expect(await holdStatus(runId)).toBe("active");
  });
});

describe("Retry after a failure (AC-8, AC-10)", () => {
  it("shows a retryable error, and the retry skips the phase already saved", async () => {
    const { u, runId } = await completedRun();
    const first = depsWith([step("a"), overloaded]);
    const after = collector();

    await postReport(first.deps, { userId: u, runId }, after.schedule);
    await after.runAll();

    const failed = await getReport(first.deps, { userId: u, runId });
    expect(failed.body).toMatchObject({
      status: "failed",
      canRetry: true,
      error: { kind: "provider_overloaded", title: "That did not work" },
      phases: [
        { label: "Step one", done: true },
        { label: "Step two", done: false },
        { label: "Step three", done: false },
      ],
    });

    const second = depsWith([step("b"), step("c")]);
    const retried = await postReport(
      second.deps,
      { userId: u, runId },
      after.schedule,
    );
    expect(retried.status).toBe(202);
    await after.runAll();
    // Phase one was not called again.
    expect(second.state.calls).toBe(2);
    expect((await reportRow(runId))?.status).toBe("ready");
  });
});

describe("Overlap after a stale reclaim (AC-7, AC-12)", () => {
  it("stops the old runner before its first phase; the new attempt finishes", async () => {
    const { u, runId } = await completedRun();
    const { deps, state } = depsWith(goodReplies);
    const after = collector();

    await postReport(deps, { userId: u, runId }, after.schedule);
    const [oldRun] = after.tasks.splice(0);
    await age(runId);

    const reclaimed = await postReport(
      deps,
      { userId: u, runId },
      after.schedule,
    );
    expect(reclaimed.status).toBe(202);
    expect((await reportRow(runId))?.attempts).toBe(2);

    await oldRun?.();
    expect(state.calls).toBe(0);
    await after.runAll();
    expect(state.calls).toBe(3);
    expect((await reportRow(runId))?.status).toBe("ready");
  });
});

describe("The last attempt (AC-15)", () => {
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

  it("keeps polling while the last attempt still runs", async () => {
    const { u, runId } = await completedRun();
    await onLastAttempt(u, runId);
    const { deps } = depsWith(goodReplies);
    const after = collector();
    const posted = await postReport(deps, { userId: u, runId }, after.schedule);
    expect(posted.status).toBe(202);
    expect(posted.body).toMatchObject({
      status: "generating",
      canRetry: false,
    });
    expect(after.tasks).toHaveLength(0);
  });

  it("fails a stale last attempt as timeout, releases the hold, and shows exhausted", async () => {
    const { u, runId } = await completedRun();
    await onLastAttempt(u, runId);
    await age(runId);
    const { deps, state } = depsWith(goodReplies);
    const after = collector();

    const posted = await postReport(deps, { userId: u, runId }, after.schedule);
    expect(posted.status).toBe(409);
    expect(body(posted).code).toBe("attempts_exhausted");
    expect(body(posted).error).toMatchObject({ kind: "exhausted" });
    expect(after.tasks).toHaveLength(0);
    expect(state.calls).toBe(0);
    expect(await holdStatus(runId)).toBe("released");

    const got = await getReport(deps, { userId: u, runId });
    expect(got.body).toMatchObject({
      status: "failed",
      canRetry: false,
      error: {
        kind: "exhausted",
        title: "We could not make this report",
        message: "Your credits were returned.",
      },
    });
  });
});

describe("Reading stored reports (AC-13)", () => {
  /** Makes a report ready directly, as if an earlier deploy had generated it. */
  const readyRun = async (version: string, stored: unknown) => {
    const { u, runId } = await completedRun(version);
    const claimed = unwrap(await reports.claim(u, runId));
    unwrap(
      await reports.markReady(
        runId,
        claimed.attempts,
        stored,
        "claude-opus-5-5",
      ),
    );
    return { u, runId };
  };

  it("draws an old version's report with its frozen reader", async () => {
    const { u, runId } = await readyRun("0", content);
    const { deps } = depsWith(goodReplies);
    const got = await getReport(deps, { userId: u, runId });
    expect(got.body).toMatchObject({
      status: "ready",
      phases: [],
      error: null,
      view: [{ kind: "text", title: "Old report", paragraphs: ["v0"] }],
    });
  });

  it("shows stored_data_invalid for an unknown version", async () => {
    const { u, runId } = await readyRun("9", content);
    const { deps } = depsWith(goodReplies);
    const got = await getReport(deps, { userId: u, runId });
    expect(got.body).toMatchObject({
      status: "ready",
      canRetry: false,
      error: { kind: "stored_data_invalid" },
    });
    expect(body(got).view).toBeUndefined();
  });

  it("shows stored_data_invalid for content that fails its schema", async () => {
    const { u, runId } = await readyRun("1", { one: { text: 1 } });
    const { deps } = depsWith(goodReplies);
    const got = await getReport(deps, { userId: u, runId });
    expect(body(got).error).toMatchObject({ kind: "stored_data_invalid" });
    expect(body(got).view).toBeUndefined();
  });
});
