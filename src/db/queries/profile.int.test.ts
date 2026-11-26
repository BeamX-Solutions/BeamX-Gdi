/**
 * Spec 0012, AC-5, AC-8 to AC-11: profile writes at completion, newer wins per key,
 * profile sourced answers write nothing, edits and removals, and the guest merge.
 */
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../client";
import * as conversations from "./conversations";
import * as profile from "./profile";
import * as runs from "./runs";
import { linkGuest } from "./users";
import { fundRun, guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

/** A run with these answers (each with its source), completed with these facts. */
const completedWith = async (
  u: string,
  answers: Readonly<Record<string, readonly [unknown, "client" | "profile"]>>,
  facts: readonly profile.RunFactEntry[],
) => {
  const conv = await conversations.create(u);
  const { run } = unwrap(await runs.start(u, conv.id, "beacon", "2"));
  await fundRun(u, run.id);
  for (const [q, [value, source]] of Object.entries(answers))
    unwrap(await runs.saveAnswer(u, run.id, q, value, source));
  const saved = unwrap(await runs.get(u, run.id)).answers;
  const last =
    saved
      .map((a) => a.updatedAt)
      .sort()
      .at(-1) ?? null;
  unwrap(
    await runs.complete(u, run.id, { total: 1 }, saved.length, last, facts),
  );
  return run;
};

const valueOf = async (u: string, key: string) =>
  (await profile.get(u)).find((f) => f.key === key);

describe("profile writes at completion (AC-5)", () => {
  it("stores each fact with its run, tool and the answer's time", async () => {
    const u = await t.guest();
    const run = await completedWith(
      u,
      { business_name: ["Ada Foods", "client"], industry: ["food", "client"] },
      [
        {
          key: "business_name",
          questionId: "business_name",
          value: "Ada Foods",
        },
        { key: "industry", questionId: "industry", value: "food_beverage" },
      ],
    );
    const facts = await profile.get(u);
    expect(facts.map((f) => [f.key, f.value])).toEqual([
      ["business_name", "Ada Foods"],
      ["industry", "food_beverage"],
    ]);
    expect(facts[0]).toMatchObject({
      sourceRunId: run.id,
      sourceToolId: "beacon",
    });
    expect(Number.isNaN(Date.parse(facts[0]?.updatedAt ?? ""))).toBe(false);
  });

  it("writes nothing for an answer that came from the profile", async () => {
    const u = await t.guest();
    await completedWith(u, { business_name: ["Ada", "profile"] }, [
      { key: "business_name", questionId: "business_name", value: "Ada" },
    ]);
    expect(await profile.get(u)).toEqual([]);
  });

  it("lets a later run replace a fact, and keeps the other keys", async () => {
    const u = await t.guest();
    await completedWith(
      u,
      { business_name: ["Old", "client"], industry: ["x", "client"] },
      [
        { key: "business_name", questionId: "business_name", value: "Old" },
        { key: "industry", questionId: "industry", value: "retail" },
      ],
    );
    await completedWith(u, { business_name: ["New", "client"] }, [
      { key: "business_name", questionId: "business_name", value: "New" },
    ]);
    expect((await valueOf(u, "business_name"))?.value).toBe("New");
    expect((await valueOf(u, "industry"))?.value).toBe("retail");
  });

  it("writes nothing when the run did not complete", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const { run } = unwrap(await runs.start(u, conv.id, "beacon", "2"));
    unwrap(await runs.saveAnswer(u, run.id, "business_name", "Ada", "client"));
    // A stale fingerprint: the completion is refused, so the profile stays empty.
    const result = await runs.complete(u, run.id, { total: 1 }, 99, null, [
      { key: "business_name", questionId: "business_name", value: "Ada" },
    ]);
    expect(result.ok).toBe(false);
    expect(await profile.get(u)).toEqual([]);
  });
});

describe("edits and removals (AC-8, AC-9)", () => {
  it("sets a fact as the client's own and removes one", async () => {
    const u = await t.guest();
    await profile.setFact(u, "industry", "retail");
    expect(await valueOf(u, "industry")).toMatchObject({
      value: "retail",
      sourceRunId: null,
      sourceToolId: null,
    });
    await profile.removeFact(u, "industry");
    expect(await valueOf(u, "industry")).toBeUndefined();
    await profile.removeFact(u, "industry");
  });

  it("an edit wins over an older run's fact", async () => {
    const u = await t.guest();
    await completedWith(u, { business_name: ["From run", "client"] }, [
      { key: "business_name", questionId: "business_name", value: "From run" },
    ]);
    await profile.setFact(u, "business_name", "Edited");
    expect((await valueOf(u, "business_name"))?.value).toBe("Edited");
  });
});

describe("guest merge (AC-10) and ownership (AC-11)", () => {
  it("merges the guest's facts, newer wins, and deletes the guest profile", async () => {
    const guest = await t.guest();
    const account = await t.guest();
    await profile.setFact(account, "industry", "retail");
    await profile.setFact(account, "business_name", "Account name");
    // The guest's industry is newer than the account's.
    await profile.setFact(guest, "industry", "hospitality");
    await linkGuest(guest, account);
    expect((await valueOf(account, "industry"))?.value).toBe("hospitality");
    expect((await valueOf(account, "business_name"))?.value).toBe(
      "Account name",
    );
    const left = await db.execute(
      sql`SELECT count(*)::int AS n FROM business_profile WHERE user_id = ${guest}::uuid`,
    );
    expect(Number((left.rows[0] as { n: number }).n)).toBe(0);
  });

  it("never reads another user's facts", async () => {
    const a = await t.guest();
    const b = await t.guest();
    await profile.setFact(a, "industry", "retail");
    expect(await profile.get(b)).toEqual([]);
  });
});
