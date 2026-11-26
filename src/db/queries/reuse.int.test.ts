/**
 * Spec 0011, AC-3, AC-6 and AC-8: the run another tool reuses answers from, and the
 * start that copies them with a hold in one batch.
 */
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import * as conversations from "./conversations";
import * as credits from "./credits";
import * as runs from "./runs";
import { completeFromAnswers, guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

const BEACON = ["beacon", "beacon_pro"] as const;

const funded = async (grant: number) => {
  const u = await t.guest();
  await credits.ensureAccount(u, grant);
  return u;
};

/** A paid run of `toolId` in a new chat with the given answers. */
const runWith = async (
  u: string,
  toolId: string,
  answers: Readonly<Record<string, string>>,
  price = 10,
) => {
  const conv = await conversations.create(u);
  const { run } = unwrap(
    await credits.startRunWithHold(u, conv.id, toolId, "1", price),
  );
  for (const [id, value] of Object.entries(answers))
    unwrap(await runs.saveAnswer(u, run.id, id, value, "client"));
  return { conv, run };
};

const completed = async (
  u: string,
  toolId: string,
  answers: Readonly<Record<string, string>>,
) => {
  const made = await runWith(u, toolId, answers);
  unwrap(await completeFromAnswers(u, made.run.id));
  return made;
};

const holdOf = async (runId: string) => {
  const r = await db.execute(sql`
    SELECT status, amount FROM credit_hold WHERE run_id = ${runId}::uuid ORDER BY created_at DESC LIMIT 1
  `);
  return r.rows[0] as { status: string; amount: number } | undefined;
};

describe("runs.reuseSource (AC-3)", () => {
  it("finds the latest completed Beacon family run from any chat", async () => {
    const u = await funded(100);
    await completed(u, "beacon", { q1: "old" });
    const latest = await completed(u, "beacon_pro", { q1: "new" });
    await completed(u, "stellar", { q1: "other tool" });
    const here = await conversations.create(u);

    const found = await runs.reuseSource(u, here.id, BEACON);
    expect(found).toMatchObject({
      runId: latest.run.id,
      toolId: "beacon_pro",
      status: "completed",
    });
    expect(typeof found?.lastAnswerAt).toBe("string");
  });

  it("prefers this chat's in progress run, but not another chat's", async () => {
    const u = await funded(100);
    await completed(u, "beacon", { q1: "done" });
    const half = await runWith(u, "beacon", { q1: "half" });
    const elsewhere = await conversations.create(u);

    expect(await runs.reuseSource(u, half.conv.id, BEACON)).toMatchObject({
      runId: half.run.id,
      status: "in_progress",
    });
    expect((await runs.reuseSource(u, elsewhere.id, BEACON))?.runId).not.toBe(
      half.run.id,
    );
  });

  it("ignores runs with no answers, other users and abandoned runs", async () => {
    const u = await funded(100);
    const other = await funded(100);
    await completed(other, "beacon", { q1: "theirs" });
    const empty = await runWith(u, "beacon", {});
    const gone = await runWith(u, "beacon", { q1: "gone" });
    unwrap(await runs.abandon(u, gone.run.id));

    expect(await runs.reuseSource(u, empty.conv.id, BEACON)).toBeNull();
    expect(await runs.reuseSource(u, empty.conv.id, [])).toBeNull();
  });
});

describe("credits.startFromOtherWithHold (AC-6, AC-8)", () => {
  it("copies the given answers into a new run with based_on_run_id and a hold", async () => {
    const u = await funded(300);
    const source = await completed(u, "beacon", { q1: "a", q2: "b" });
    const here = await conversations.create(u);

    const started = unwrap(
      await credits.startFromOtherWithHold(
        u,
        here.id,
        source.run.id,
        "beacon_pro",
        "1",
        150,
        [{ questionId: "q1", value: "a", source: "client" }],
      ),
    );
    expect(started.run).toMatchObject({
      toolId: "beacon_pro",
      conversationId: here.id,
      basedOnRunId: source.run.id,
      status: "in_progress",
    });
    expect(started.hold).toMatchObject({ amount: 150 });
    expect(started.abandonedRunId).toBeNull();
    const copied = unwrap(await runs.get(u, started.run.id)).answers;
    expect(copied.map((a) => [a.questionId, a.value, a.source])).toEqual([
      ["q1", "a", "client"],
    ]);
    // The completed source is untouched.
    expect(unwrap(await runs.get(u, source.run.id)).run.status).toBe(
      "completed",
    );
  });

  it("abandons this chat's half done source and releases its hold first", async () => {
    // 155 covers Pro's 150 only once Beacon's 10 is released in the same batch.
    const u = await funded(155);
    const half = await runWith(u, "beacon", { q1: "a" });
    expect(await holdOf(half.run.id)).toMatchObject({ status: "active" });

    const started = unwrap(
      await credits.startFromOtherWithHold(
        u,
        half.conv.id,
        half.run.id,
        "beacon_pro",
        "1",
        150,
        [{ questionId: "q1", value: "a", source: "client" }],
      ),
    );
    expect(started.abandonedRunId).toBe(half.run.id);
    expect(started.pausedRunId).toBeNull();
    expect(unwrap(await runs.get(u, half.run.id)).run.status).toBe("abandoned");
    expect(await holdOf(half.run.id)).toMatchObject({ status: "released" });
    expect(await credits.getSummary(u)).toMatchObject({ held: 150 });
  });

  it("changes nothing when the balance is short", async () => {
    const u = await funded(100);
    const half = await runWith(u, "beacon", { q1: "a" });
    expect(
      await credits.startFromOtherWithHold(
        u,
        half.conv.id,
        half.run.id,
        "beacon_pro",
        "1",
        150,
        [],
      ),
    ).toMatchObject({ ok: false, error: { code: "insufficient_credits" } });
    // The whole batch rolled back: the half done run and its hold stand.
    expect(unwrap(await runs.get(u, half.run.id)).run.status).toBe(
      "in_progress",
    );
    expect(await holdOf(half.run.id)).toMatchObject({ status: "active" });
  });

  it("returns not_found for a missing or foreign source, creating nothing", async () => {
    const u = await funded(300);
    const other = await funded(300);
    const theirs = await completed(other, "beacon", { q1: "x" });
    const here = await conversations.create(u);
    for (const sourceId of [newId(), theirs.run.id])
      expect(
        await credits.startFromOtherWithHold(
          u,
          here.id,
          sourceId,
          "beacon_pro",
          "1",
          150,
          [],
        ),
      ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await credits.getSummary(u)).toMatchObject({ held: 0 });
  });
});
