import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { policyAcceptance } from "../schema";
import { deleteUser, guestTracker } from "../test/helpers";
import * as policies from "./policies";
import { linkGuest } from "./users";

// Spec 0017, AC-5, AC-6: acceptances are recorded once per version, and the newest
// terms version is what the updated terms card compares.

const users = guestTracker();
afterAll(users.cleanup);

const rowsOf = (userId: string) =>
  db
    .select({
      policy: policyAcceptance.policy,
      version: policyAcceptance.version,
    })
    .from(policyAcceptance)
    .where(eq(policyAcceptance.userId, userId));

describe("policies", () => {
  it("records each version once, however often it is called", async () => {
    const id = await users.guest();
    const both = [
      { policy: "terms", version: "v1" },
      { policy: "privacy", version: "v1" },
    ] as const;
    await policies.record(id, both);
    await policies.record(id, both);
    expect(await rowsOf(id)).toHaveLength(2);
  });

  it("reads the newest accepted version of each policy, or null", async () => {
    const id = await users.guest();
    expect(await policies.newestVersions(id)).toEqual({
      terms: null,
      privacy: null,
    });
    await policies.record(id, [{ policy: "terms", version: "v1" }]);
    await policies.record(id, [{ policy: "terms", version: "v2" }]);
    expect(await policies.newestVersions(id)).toEqual({
      terms: "v2",
      privacy: null,
    });
    await policies.record(id, [{ policy: "privacy", version: "v9" }]);
    expect(await policies.newestVersions(id)).toEqual({
      terms: "v2",
      privacy: "v9",
    });
  });

  it("never reads another user's acceptances", async () => {
    const mine = await users.guest();
    const theirs = await users.guest();
    await policies.record(theirs, [{ policy: "terms", version: "v1" }]);
    expect(await policies.newestVersions(mine)).toEqual({
      terms: null,
      privacy: null,
    });
  });

  it("moves a guest's rows on link without clashing with the account's", async () => {
    const guest = await users.guest();
    const account = await users.guest();
    await policies.record(guest, [
      { policy: "terms", version: "v1" },
      { policy: "privacy", version: "v1" },
    ]);
    await policies.record(account, [{ policy: "terms", version: "v1" }]);
    await linkGuest(guest, account);
    expect(await rowsOf(account)).toEqual(
      expect.arrayContaining([
        { policy: "terms", version: "v1" },
        { policy: "privacy", version: "v1" },
      ]),
    );
    expect(await rowsOf(account)).toHaveLength(2);
  });

  it("goes with the user when they are deleted", async () => {
    const id = await users.guest();
    await policies.record(id, [{ policy: "terms", version: "v1" }]);
    await deleteUser(id);
    expect(await rowsOf(id)).toEqual([]);
  });
});
