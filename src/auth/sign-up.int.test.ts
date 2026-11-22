import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Spec 0009, AC-2 and AC-6: an email account is created by the code sign in, in the tab
// that holds the guest cookie, and the guest's work moves to it. Runs Better Auth's real
// endpoints against the Neon test branch; the emailed code is captured instead of sent.

const { codes, linkControl } = vi.hoisted(() => ({
  codes: new Map<string, string>(),
  linkControl: { fail: false },
}));

vi.mock("@/email/send", () => ({
  sendCodeEmail: async (to: string, code: string) => {
    codes.set(to, code);
    return { ok: true, value: undefined };
  },
}));

vi.mock("@/db/queries/users", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/queries/users")>();
  return {
    ...real,
    linkGuest: async (guest: string, next: string) => {
      if (linkControl.fail) throw new Error("forced link failure");
      return real.linkGuest(guest, next);
    },
  };
});

const { auth } = await import("./auth");
const { db } = await import("@/db/client");
const { newId } = await import("@/db/id");
const { conversation, user } = await import("@/db/schema");
const conversations = await import("@/db/queries/conversations");

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await db.delete(user).where(eq(user.id, id));
});

/** The `Cookie` header a browser would send back after these `Set-Cookie` headers. */
const cookieFrom = (headers: Headers): Headers => {
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
};

/** Signs a guest in the way the chat does, and gives them one chat. */
const guestWithChat = async () => {
  const signedIn = await auth.api.signInAnonymous({ returnHeaders: true });
  const guestId = signedIn.response?.user.id;
  if (guestId === undefined) throw new Error("no guest");
  created.push(guestId);
  const chatId = newId();
  const context = await conversations.turnContext(
    guestId,
    chatId,
    newId(),
    true,
  );
  if (!context.ok) throw new Error("no chat");
  return { guestId, chatId, cookies: cookieFrom(signedIn.headers) };
};

const signUpByCode = async (cookies: Headers, email: string) => {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const otp = codes.get(email);
  if (otp === undefined) throw new Error("no code captured");
  return auth.api.signInEmailOTP({
    body: { email, otp, name: "Ada" },
    headers: cookies,
    returnHeaders: true,
  });
};

const ownerOf = async (chatId: string) => {
  const [row] = await db
    .select({ userId: conversation.userId })
    .from(conversation)
    .where(eq(conversation.id, chatId));
  return row?.userId ?? null;
};

describe("sign up by code (spec 0009, AC-2, AC-6)", () => {
  it("creates a verified, named account and moves the guest's chat to it", async () => {
    const { guestId, chatId, cookies } = await guestWithChat();
    const email = `${newId()}@signup.test`;
    const result = await signUpByCode(cookies, email);
    const account = result.response.user;
    created.push(account.id);

    expect(account.email).toBe(email);
    expect(account.emailVerified).toBe(true);
    expect(account.name).toBe("Ada");
    expect(await ownerOf(chatId)).toBe(account.id);
    // Better Auth deletes the guest once the link succeeded.
    const [guest] = await db.select().from(user).where(eq(user.id, guestId));
    expect(guest).toBeUndefined();

    // The password is then set inside that session (the set-password route's call).
    const session = cookieFrom(result.headers);
    await auth.api.setPassword({
      headers: session,
      body: { newPassword: `pw-${newId()}` },
    });
  });

  it("creates no account before the code is entered", async () => {
    const email = `${newId()}@pending.test`;
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const rows = await db.select().from(user).where(eq(user.email, email));
    expect(rows).toEqual([]);
  });

  it("keeps the guest and their chat when the link fails", async () => {
    const { guestId, chatId, cookies } = await guestWithChat();
    const email = `${newId()}@failed-link.test`;
    linkControl.fail = true;
    try {
      await expect(signUpByCode(cookies, email)).rejects.toThrow();
    } finally {
      linkControl.fail = false;
    }
    const [guest] = await db.select().from(user).where(eq(user.id, guestId));
    expect(guest?.id).toBe(guestId);
    expect(await ownerOf(chatId)).toBe(guestId);
    const leftover = await db.select().from(user).where(eq(user.email, email));
    for (const row of leftover) created.push(row.id);
  });
});
