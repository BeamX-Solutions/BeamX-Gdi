import { afterAll, describe, expect, it } from "vitest";
import { guestTracker, runWithAnswers } from "../test/helpers";
import { readAll } from "./export";
import { toExport } from "./export-shape";
import * as policies from "./policies";

// Spec 0017, AC-7: the export holds everything the user owns, in one batched read, and
// nothing of anyone else's.

const users = guestTracker();
afterAll(users.cleanup);

const exportOf = async (userId: string) =>
  toExport(await readAll(userId), new Date());

describe("export.readAll", () => {
  it("holds the user's chats, runs with answers, credits and acceptances", async () => {
    const id = await users.guest();
    const { conv, run } = await runWithAnswers(id, "stellar", "1", {
      q1: "first",
      q2: "second",
    });
    await policies.record(id, [{ policy: "terms", version: "v1" }]);

    const out = await exportOf(id);
    expect(out.user).toMatchObject({ guest: true, email: null });
    expect(out.conversations.map((c) => c.id)).toEqual([conv.id]);
    expect(out.runs.map((r) => r.id)).toEqual([run.id]);
    expect(
      out.runs[0]?.answers.map((a) => [a.questionId, a.value]).sort(),
    ).toEqual([
      ["q1", "first"],
      ["q2", "second"],
    ]);
    // `runWithAnswers` funds the run: a grant on the ledger and an active hold.
    expect(out.credits.ledger.length).toBeGreaterThan(0);
    expect(out.credits.holds.map((h) => h.runId)).toContain(run.id);
    expect(out.policyAcceptances).toMatchObject([
      { policy: "terms", version: "v1" },
    ]);
  });

  it("never includes another user's rows", async () => {
    const mine = await users.guest();
    const theirs = await users.guest();
    const { conv, run } = await runWithAnswers(theirs);
    await policies.record(theirs, [{ policy: "terms", version: "v1" }]);

    const out = await exportOf(mine);
    expect(JSON.stringify(out)).not.toContain(conv.id);
    expect(JSON.stringify(out)).not.toContain(run.id);
    expect(out.conversations).toEqual([]);
    expect(out.runs).toEqual([]);
    expect(out.credits.ledger).toEqual([]);
    expect(out.policyAcceptances).toEqual([]);
  });
});
