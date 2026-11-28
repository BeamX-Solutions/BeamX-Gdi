import { beforeEach, describe, expect, it, vi } from "vitest";

// `GET /api/account/export` (spec 0017, AC-7): any session gets its file as an
// attachment, never cached; no session is 401; a 4th export in the hour is 429. The
// session, the DB read and the Redis counter are mocked at the boundary.

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { sessionUserId, readAll, take, giveBack } = vi.hoisted(() => ({
  sessionUserId: vi.fn(),
  readAll: vi.fn(),
  take: vi.fn(),
  giveBack: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/auth/session", () => ({ sessionUserId }));
vi.mock("@/db/queries/export", () => ({ readAll }));
vi.mock("@/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  limitStore: { take, giveBack },
}));

const { GET } = await import("./route");

const rows = {
  user: [
    {
      email: "ada@example.com",
      name: "Ada",
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      isAnonymous: false,
    },
  ],
  conversations: [
    { id: "c1", title: "Idea", createdAt: "t0", lastMessageAt: "t1" },
  ],
  messages: [],
  runs: [],
  answers: [],
  reports: [],
  profile: [],
  creditAccount: [],
  ledger: [],
  holds: [],
  payments: [],
  consultations: [],
  policies: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUserId.mockResolvedValue("u1");
  readAll.mockResolvedValue(rows);
  take.mockResolvedValue(1);
});

describe("GET /api/account/export", () => {
  it("returns the session user's data as a dated JSON attachment, never cached", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="beamx-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.user).toMatchObject({ email: "ada@example.com", guest: false });
    expect(body.conversations).toHaveLength(1);
    expect(readAll).toHaveBeenCalledWith("u1");
  });

  it("reads only the session user's rows", async () => {
    sessionUserId.mockResolvedValue("someone-else");
    await GET();
    expect(readAll).toHaveBeenCalledWith("someone-else");
    expect(readAll).toHaveBeenCalledTimes(1);
  });

  it("answers 401 with no session and reads nothing", async () => {
    sessionUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "unauthenticated" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(readAll).not.toHaveBeenCalled();
  });

  it("answers 429 on the 4th export in an hour, keyed by user and UTC hour", async () => {
    take.mockResolvedValue(4);
    const res = await GET();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "rate_limited" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(take.mock.calls[0]?.[0]).toBe("data_export");
    expect(take.mock.calls[0]?.[1]).toMatch(
      /^limit:data_export:u1:\d{4}-\d{2}-\d{2}T\d{2}$/,
    );
    expect(giveBack).toHaveBeenCalled();
    expect(readAll).not.toHaveBeenCalled();
  });

  it("serves a guest too, without their placeholder email", async () => {
    sessionUserId.mockResolvedValue("g1");
    readAll.mockResolvedValue({
      ...rows,
      user: [{ ...rows.user[0], email: "temp@anon.local", isAnonymous: true }],
    });
    const body = await (await GET()).json();
    expect(body.user).toMatchObject({ guest: true, email: null, name: null });
  });
});
