import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Spec 0009, AC-13 and AC-18: deleting your own account through `/api/account/delete`
// (the real route and Better Auth, against the Neon test branch), the fresh session
// rule, the cascade, work that finishes after the delete, and per user ownership.

const { codes } = vi.hoisted(() => ({ codes: new Map<string, string>() }));

vi.mock("@/email/send", () => ({
  sendCodeEmail: async (to: string, code: string) => {
    codes.set(to, code);
    return { ok: true, value: undefined };
  },
}));
// BotID only runs on Vercel; here every request is human.
vi.mock("@/lib/bot-check", () => ({ isBot: async () => false }));

const { auth } = await import("./auth");
const { POST } = await import("@/app/api/account/delete/route");
const { db } = await import("@/db/client");
const { newId } = await import("@/db/id");
const { aiUsage, conversation, creditAccount, session, toolRun, user } =
  await import("@/db/schema");
const conversations = await import("@/db/queries/conversations");
const reports = await import("@/db/queries/reports");
const usage = await import("@/db/queries/usage");
const { completeFromAnswers, runWithAnswers, unwrap } =
  await import("@/db/test/helpers");

const created: string[] = [];
const usageIds: string[] = [];
afterAll(async () => {
  for (const id of created) await db.delete(user).where(eq(user.id, id));
  for (const id of usageIds) await db.delete(aiUsage).where(eq(aiUsage.id, id));
});

const cookieFrom = (headers: Headers): Headers =>
  new Headers({
    cookie: headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });

/** A verified account made by the code sign in, with its session cookie. */
const account = async () => {
  const email = `${newId()}@delete.test`;
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const otp = codes.get(email);
  if (otp === undefined) throw new Error("no code captured");
  const signedIn = await auth.api.signInEmailOTP({
    body: { email, otp, name: "Ada" },
    returnHeaders: true,
  });
  const userId = signedIn.response.user.id;
  created.push(userId);
  return { userId, email, cookies: cookieFrom(signedIn.headers) };
};

const deleteRequest = (cookies: Headers, email: string) =>
  POST(
    new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: {
        cookie: cookies.get("cookie") ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    }),
  );

const userExists = async (id: string) =>
  (await db.select({ id: user.id }).from(user).where(eq(user.id, id))).length >
  0;

describe("delete account (spec 0009, AC-13)", () => {
  it("refuses a typed email that isn't the account's, and keeps the user", async () => {
    const { userId, cookies } = await account();
    const response = await deleteRequest(cookies, "someone@else.test");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "email_mismatch" });
    expect(await userExists(userId)).toBe(true);
  });

  it("refuses a guest and a request with no session", async () => {
    const guest = await auth.api.signInAnonymous({ returnHeaders: true });
    const guestId = guest.response?.user.id;
    if (guestId === undefined) throw new Error("no guest");
    created.push(guestId);
    const guestEmail = guest.response?.user.email ?? "";
    expect(
      (await deleteRequest(cookieFrom(guest.headers), guestEmail)).status,
    ).toBe(401);
    expect((await deleteRequest(new Headers(), "a@b.test")).status).toBe(401);
    expect(await userExists(guestId)).toBe(true);
  });

  it("asks a session older than a day to sign in again, then deletes after a fresh sign in", async () => {
    const { userId, email, cookies } = await account();
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(session.userId, userId));
    const stale = await deleteRequest(cookies, email);
    expect(stale.status).toBe(400);
    expect(await stale.json()).toEqual({ code: "SESSION_EXPIRED" });
    expect(await userExists(userId)).toBe(true);

    // The dialog's sign in again step: a password sign in makes a fresh session.
    const password = `pw-${newId()}`;
    await auth.api.setPassword({
      headers: cookies,
      body: { newPassword: password },
    });
    const again = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const fresh = await deleteRequest(cookieFrom(again.headers), email);
    expect(fresh.status).toBe(200);
    expect(await userExists(userId)).toBe(false);
  });

  it("removes the user and everything that hangs off it, ends the session, and drops late work", async () => {
    const { userId, email, cookies } = await account();
    const { conv, run } = await runWithAnswers(userId);
    unwrap(await completeFromAnswers(userId, run.id));
    // A report still generating when the account goes.
    const claimed = unwrap(await reports.claim(userId, run.id));

    const response = await deleteRequest(cookies, email.toUpperCase());
    expect(response.status).toBe(200);
    // The response expires the session cookie.
    expect(response.headers.getSetCookie().join(";")).toMatch(/Max-Age=0/i);

    expect(await userExists(userId)).toBe(false);
    for (const [table, column] of [
      [conversation, conversation.userId],
      [toolRun, toolRun.userId],
      [creditAccount, creditAccount.userId],
      [session, session.userId],
    ] as const)
      expect(await db.select().from(table).where(eq(column, userId))).toEqual(
        [],
      );
    expect(await auth.api.getSession({ headers: cookies })).toBeNull();

    // Work finishing for that user afterwards is dropped, never thrown.
    expect(
      await reports.markReady(
        run.id,
        claimed.attempts,
        { any: 1 },
        "test-model",
      ),
    ).toEqual({ ok: false, error: { code: "stale_attempt" } });
    expect(await conversations.ownerOf(conv.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    const recorded = await usage.record({
      callKey: `delete-test-${newId()}`,
      userId,
      conversationId: conv.id,
      runId: run.id,
      purpose: "chat",
      model: "test-model",
      costUsd: 0,
    });
    expect(recorded.status).toBe("recorded");
    if (recorded.status === "recorded") {
      usageIds.push(recorded.id);
      const [row] = await db
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.id, recorded.id));
      expect(row?.userId).toBeNull();
      expect(row?.conversationId).toBeNull();
      expect(row?.runId).toBeNull();
    }
  });
});

describe("signed in users only see their own chats (spec 0009, AC-18)", () => {
  it("another account's chat id answers not_found", async () => {
    const a = await account();
    const b = await account();
    const conv = await conversations.create(a.userId);
    expect(await conversations.open(b.userId, conv.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect((await conversations.open(a.userId, conv.id)).ok).toBe(true);
  });
});
