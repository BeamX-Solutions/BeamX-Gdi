/**
 * Spec 0014, AC-4: the latest ready reports from the user's other chats.
 */
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import * as runs from "./runs";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

/** A completed run whose report is marked ready directly (the runner is not under test). */
const readyRun = async (u: string) => {
  const { conv, run } = await runWithAnswers(u);
  unwrap(await completeFromAnswers(u, run.id));
  await db.execute(
    sql`UPDATE report SET status = 'ready', content = '{}'::jsonb, attempts = 1 WHERE run_id = ${run.id}::uuid`,
  );
  return { conv, run };
};

describe("runs.recentReports (spec 0014, AC-4)", () => {
  it("lists ready reports from other chats, newest first, never this chat's or another user's", async () => {
    const u = await t.guest();
    const other = await t.guest();
    const older = await readyRun(u);
    const newer = await readyRun(u);
    const here = await readyRun(u);
    await readyRun(other);
    const { run: notReady } = await runWithAnswers(u);
    unwrap(await completeFromAnswers(u, notReady.id));

    const found = await runs.recentReports(u, here.conv.id, 5);
    expect(found.map((r) => r.runId)).toEqual([newer.run.id, older.run.id]);
    expect(found[0]).toMatchObject({ toolId: "stellar" });
    expect(await runs.recentReports(u, here.conv.id, 1)).toHaveLength(1);
  });
});
