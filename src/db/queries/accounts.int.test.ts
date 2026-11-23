import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { account, user } from "../schema";
import { guestTracker } from "../test/helpers";
import { emailStatus } from "./users";

// Spec 0009, AC-2 and AC-8: the sign up form's email check.

const t = guestTracker();
const accounts: string[] = [];
afterAll(async () => {
  await t.cleanup();
  for (const id of accounts) await db.delete(user).where(eq(user.id, id));
});

/** A verified account with the given sign in methods. */
const makeAccount = async (
  email: string,
  providers: readonly ("credential" | "google")[],
  isAnonymous: boolean | null = false,
) => {
  const id = newId();
  accounts.push(id);
  await db.insert(user).values({
    id,
    name: "Ada",
    email,
    emailVerified: true,
    isAnonymous,
  });
  for (const providerId of providers)
    await db.insert(account).values({
      accountId: providerId === "credential" ? id : `g-${id}`,
      providerId,
      userId: id,
      password: providerId === "credential" ? "hash" : null,
      updatedAt: new Date(),
    });
  return id;
};

describe("emailStatus (spec 0009, AC-8)", () => {
  it("is none for an unknown email and for a guest's placeholder email", async () => {
    expect(await emailStatus(`${newId()}@nobody.test`)).toBe("none");
    const guest = await t.guest();
    expect(await emailStatus(`${guest}@guest.test`)).toBe("none");
  });

  it("is exists for an account with a password, matched case insensitively", async () => {
    const email = `${newId()}@ada.test`;
    await makeAccount(email, ["credential"]);
    expect(await emailStatus(email)).toBe("exists");
    expect(await emailStatus(`  ${email.toUpperCase()} `)).toBe("exists");
  });

  it("is exists for an account with both Google and a password", async () => {
    const email = `${newId()}@both.test`;
    await makeAccount(email, ["google", "credential"]);
    expect(await emailStatus(email)).toBe("exists");
  });

  it("is google_only for an account made with Google alone", async () => {
    const email = `${newId()}@google.test`;
    await makeAccount(email, ["google"]);
    expect(await emailStatus(email)).toBe("google_only");
  });

  it("is exists, not google_only, for a code sign up closed before the password", async () => {
    const email = `${newId()}@nopassword.test`;
    await makeAccount(email, []);
    expect(await emailStatus(email)).toBe("exists");
  });

  it("counts an account whose is_anonymous is null as an account", async () => {
    const email = `${newId()}@null.test`;
    await makeAccount(email, ["credential"], null);
    expect(await emailStatus(email)).toBe("exists");
  });
});
