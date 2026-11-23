import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { anonymous } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import {
  dropStaleSessionCookie,
  isSignInPath,
  withoutCookies,
} from "./stale-session";

describe("withoutCookies", () => {
  it("drops the matched cookies and keeps the rest in order", () => {
    expect(
      withoutCookies("a=1; better-auth.session_token=x.y; b=2", (n) =>
        n.endsWith("session_token"),
      ),
    ).toBe("a=1; b=2");
  });

  it("gives an empty header when every cookie is dropped", () => {
    expect(withoutCookies("s=1", () => true)).toBe("");
  });
});

describe("isSignInPath", () => {
  it("matches the paths the anonymous plugin links on", () => {
    expect(isSignInPath("/sign-in/email")).toBe(true);
    expect(isSignInPath("/sign-in/email-otp")).toBe(true);
    expect(isSignInPath("/sign-in/anonymous")).toBe(true);
    expect(isSignInPath("/get-session")).toBe(false);
    expect(isSignInPath(undefined)).toBe(false);
  });
});

// Real Better Auth with the anonymous plugin, on its in memory adapter (no DB, no env).
const BASE = "http://localhost:3000";
const setup = () => {
  const db = {
    user: [] as { id: string }[],
    session: [] as { id: string }[],
    account: [] as { id: string }[],
    verification: [] as { id: string }[],
  };
  const auth = betterAuth({
    baseURL: BASE,
    secret: "test-secret-0123456789-abcdefghijklmnop",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    hooks: { before: dropStaleSessionCookie },
    plugins: [anonymous()],
    logger: { disabled: true },
  });
  const post = (path: string, body: unknown, cookie = "") =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie },
        body: JSON.stringify(body),
      }),
    );
  return { db, post };
};

const cookieOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** The value the browser keeps for the session cookie: the last `Set-Cookie` wins. */
const sessionCookie = (response: Response): string | undefined =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c.startsWith("better-auth.session_token="))
    .at(-1)
    ?.slice("better-auth.session_token=".length);

const ACCOUNT = { email: "a@example.com", password: "password123", name: "A" };

describe("sign in with a stale session cookie", () => {
  it("sets a session cookie after the old sessions were revoked", async () => {
    const { db, post } = setup();
    const stale = cookieOf(await post("/sign-up/email", ACCOUNT));
    db.session.length = 0; // revoked, like a password reset or a purge

    const response = await post("/sign-in/email", ACCOUNT, stale);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/.+/);
  });

  it("signs a guest in when the old guest session is gone", async () => {
    const { db, post } = setup();
    const stale = cookieOf(await post("/sign-in/anonymous", {}));
    db.session.length = 0;

    const response = await post("/sign-in/anonymous", {}, stale);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/.+/);
  });

  it("sets a session cookie when the old session row has expired", async () => {
    const { db, post } = setup();
    const stale = cookieOf(await post("/sign-up/email", ACCOUNT));
    for (const s of db.session) Object.assign(s, { expiresAt: new Date(0) });

    const response = await post("/sign-in/email", ACCOUNT, stale);

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/.+/);
  });

  it("signs in when the session cookie has a forged signature", async () => {
    const { post } = setup();
    await post("/sign-up/email", ACCOUNT);

    const response = await post(
      "/sign-in/email",
      ACCOUNT,
      "better-auth.session_token=forged.bad-signature",
    );

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/.+/);
  });

  it("still links a live guest on sign in", async () => {
    const { db, post } = setup();
    await post("/sign-up/email", ACCOUNT);
    const guest = await post("/sign-in/anonymous", {});
    const guestId = ((await guest.clone().json()) as { user: { id: string } })
      .user.id;

    const response = await post("/sign-in/email", ACCOUNT, cookieOf(guest));

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/.+/);
    expect(db.user.some((u) => u.id === guestId)).toBe(false);
  });
});
