import { beforeEach, describe, expect, it, vi } from "vitest";

// The guards in front of Better Auth's handler (spec 0009, AC-13, AC-15; spec 0008, AC-8).
// Better Auth itself, BotID, the guest cap store and logging are the boundaries mocked here.

const { betterAuthPost, bot, guestLimit, events } = vi.hoisted(() => ({
  betterAuthPost: vi.fn<(request: Request) => Promise<Response>>(),
  bot: { value: false },
  guestLimit: vi.fn(
    async (
      _deps: unknown,
      _ip: string | null,
      signIn: () => Promise<Response>,
    ): Promise<Response> => signIn(),
  ),
  events: [] as string[],
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: betterAuthPost }),
}));
vi.mock("@/auth/auth", () => ({ auth: {} }));
vi.mock("@/auth/guest-limit", () => ({ limitGuestSignIn: guestLimit }));
vi.mock("@/auth/rate-limit", () => ({
  RATE_LIMITED_BODY: { code: "rate_limited" },
}));
vi.mock("@/lib/bot-check", () => ({ isBot: async () => bot.value }));
vi.mock("@/lib/limits", () => ({
  guestGuards: {},
  limits: { guestsPerIp: 30 },
}));
vi.mock("@/lib/log", () => ({
  logEvent: (event: string) => {
    events.push(event);
  },
}));
vi.mock("@/lib/env", () => ({ env: { VERCEL: undefined } }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { POST } = await import("./route");

const post = (path: string) =>
  POST(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
    }) as Parameters<typeof POST>[0],
  );

beforeEach(() => {
  bot.value = false;
  events.length = 0;
  betterAuthPost.mockReset();
  betterAuthPost.mockResolvedValue(Response.json({ ok: true }));
  guestLimit.mockClear();
});

describe("blocked Better Auth paths", () => {
  it.each(["/delete-user", "/sign-up/email", "/delete-user/"])(
    "answers 404 for %s and never reaches Better Auth (AC-13, spec 0009 flow 1)",
    async (path) => {
      const response = await post(path);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: "not_found" });
      expect(betterAuthPost).not.toHaveBeenCalled();
    },
  );

  it("blocks /delete-user even for a request BotID would pass", async () => {
    bot.value = false;

    const response = await post("/delete-user");

    expect(response.status).toBe(404);
  });
});

describe("BotID on the auth POSTs (AC-15)", () => {
  it.each([
    "/sign-in/email",
    "/email-otp/send-verification-otp",
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
  ])("answers 403 bot on %s and never reaches Better Auth", async (path) => {
    bot.value = true;

    const response = await post(path);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "bot" });
    expect(betterAuthPost).not.toHaveBeenCalled();
  });

  it("answers 403 bot on the guest sign in before the guest cap runs", async () => {
    bot.value = true;

    const response = await post("/sign-in/anonymous");

    expect(response.status).toBe(403);
    expect(guestLimit).not.toHaveBeenCalled();
  });

  it("passes a human sign in through to Better Auth", async () => {
    const response = await post("/sign-in/email");

    expect(response.status).toBe(200);
    expect(betterAuthPost).toHaveBeenCalledTimes(1);
  });

  it("does not BotID check a path outside the list, such as sign out", async () => {
    bot.value = true;

    const response = await post("/sign-out");

    expect(response.status).toBe(200);
    expect(betterAuthPost).toHaveBeenCalledTimes(1);
  });
});

describe("the guest sign in (spec 0008, AC-8)", () => {
  it("goes through the guest cap, not Better Auth's 429 mapping", async () => {
    betterAuthPost.mockResolvedValue(
      Response.json({ message: "slow down" }, { status: 429 }),
    );

    const response = await post("/sign-in/anonymous");

    expect(guestLimit).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ message: "slow down" });
  });
});

describe("Better Auth's rate limit answer (AC-15)", () => {
  it("becomes 429 rate_limited, keeps the retry header, and is logged", async () => {
    betterAuthPost.mockResolvedValue(
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
        headers: { "X-Retry-After": "42" },
      }),
    );

    const response = await post("/sign-in/email");

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "rate_limited" });
    expect(response.headers.get("X-Retry-After")).toBe("42");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(events).toEqual(["auth_rate_limited"]);
  });

  it("defaults the retry header to 60 when Better Auth sends none", async () => {
    betterAuthPost.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await post("/sign-in/email");

    expect(response.headers.get("X-Retry-After")).toBe("60");
  });

  it("leaves any other status untouched", async () => {
    betterAuthPost.mockResolvedValue(
      Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 }),
    );

    const response = await post("/sign-in/email");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    expect(events).toEqual([]);
  });
});
