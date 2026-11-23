import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

// The return from Paystack (spec 0004, AC-8, AC-13): the session, the chat owner lookup,
// the payment queries and Paystack's verify are mocked; the real flow and redirect run.

const USER = "0190a1b2-0000-7000-8000-0000000000aa";
const OTHER = "0190a1b2-0000-7000-8000-0000000000bb";
const PAYMENT = "0190a1b2-0000-7000-8000-000000000001";
const CHAT = "0190a1b2-0000-7000-8000-0000000000cc";

const { sessionUserId, ownerOf, forUser, verify, markSucceeded } = vi.hoisted(
  () => ({
    sessionUserId: vi.fn(),
    ownerOf: vi.fn(),
    forUser: vi.fn(),
    verify: vi.fn(),
    markSucceeded: vi.fn(),
  }),
);

vi.mock("@/auth/session", () => ({ sessionUserId }));
vi.mock("@/db/queries/conversations", () => ({ ownerOf }));
vi.mock("@/db/queries/payments", () => ({ forUser }));
vi.mock("../payment-deps", () => ({
  verify,
  settleDeps: { markSucceeded, markFailed: vi.fn(), log: vi.fn() },
}));

const { GET } = await import("./route");

const callback = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/credits/callback?${query}`));

const location = (res: Response) => {
  const url = new URL(res.headers.get("location") ?? "");
  return `${url.pathname}${url.search}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUserId.mockResolvedValue(USER);
  ownerOf.mockResolvedValue(ok(USER));
  forUser.mockImplementation(async (userId: string, id: string) =>
    userId === USER && id === PAYMENT
      ? {
          id: PAYMENT,
          userId: USER,
          credits: 100,
          amountKobo: 1_000_000,
          currency: "NGN",
          status: "pending",
          createdAt: "2026-11-23 10:00:00+00",
        }
      : null,
  );
  verify.mockResolvedValue(
    ok({
      id: "4099260516",
      reference: PAYMENT,
      status: "success",
      amount: 1_000_000,
      currency: "NGN",
      paidAt: "2026-11-23T10:15:00.000Z",
    }),
  );
  markSucceeded.mockResolvedValue({ granted: true });
});

describe("GET /credits/callback", () => {
  it("grants a paid checkout and goes back to the buyer's own chat (AC-8)", async () => {
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`/c/${CHAT}?payment=succeeded`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(markSucceeded).toHaveBeenCalledTimes(1);
  });

  it("sends a returnTo chat owned by someone else to /credits instead", async () => {
    ownerOf.mockResolvedValue(ok(OTHER));
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(location(res)).toBe("/credits?payment=succeeded");
  });

  it("sends a returnTo chat that does not exist to /credits", async () => {
    ownerOf.mockResolvedValue(err({ code: "not_found" }));
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(location(res)).toBe("/credits?payment=succeeded");
  });

  it("never looks up a returnTo that is not a UUID, such as an outside URL", async () => {
    const res = await callback(
      `reference=${PAYMENT}&returnTo=${encodeURIComponent("https://evil.test")}`,
    );
    expect(ownerOf).not.toHaveBeenCalled();
    expect(location(res)).toBe("/credits?payment=succeeded");
  });

  it("lands on /credits as pending with no session, touching nothing (AC-13)", async () => {
    sessionUserId.mockResolvedValue(null);
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/credits?payment=pending");
    expect(forUser).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("shows not_found for another user's payment and never asks Paystack (AC-13)", async () => {
    sessionUserId.mockResolvedValue(OTHER);
    ownerOf.mockResolvedValue(ok(OTHER));
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(location(res)).toBe("/credits?payment=not_found");
    expect(verify).not.toHaveBeenCalled();
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("returns to the chat as pending when Paystack is down, granting nothing", async () => {
    verify.mockResolvedValue(err({ code: "paystack_unavailable" }));
    const res = await callback(`reference=${PAYMENT}&returnTo=${CHAT}`);
    expect(location(res)).toBe(`/c/${CHAT}?payment=pending`);
    expect(markSucceeded).not.toHaveBeenCalled();
  });
});
