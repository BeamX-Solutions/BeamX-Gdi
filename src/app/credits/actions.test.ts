import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/result";

// The checkout Server Action (spec 0004, AC-8, AC-13): input checked with Zod, prices only
// from billingConfig. The session, grants, payment row, Paystack and limits are mocked.

const USER = "0190a1b2-0000-7000-8000-0000000000aa";
const PAYMENT = "0190a1b2-0000-7000-8000-000000000001";
const CHAT = "0190a1b2-0000-7000-8000-0000000000cc";

const { sessionAccount, claimGrants, create, initialize, allowCheckout } =
  vi.hoisted(() => ({
    sessionAccount: vi.fn(),
    claimGrants: vi.fn(),
    create: vi.fn(),
    initialize: vi.fn(),
    allowCheckout: vi.fn(),
  }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/auth/session", () => ({ sessionAccount }));
vi.mock("@/auth/grants", () => ({ claimGrants }));
vi.mock("@/db/queries/payments", () => ({ create }));
vi.mock("@/billing/paystack", () => ({ initialize }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("./payment-deps", () => ({ allowCheckout, paystackDeps: {} }));

const { startCheckoutAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  sessionAccount.mockResolvedValue({
    id: USER,
    isAnonymous: false,
    email: "ada@test.beamx",
  });
  allowCheckout.mockResolvedValue(true);
  create.mockResolvedValue({ id: PAYMENT });
  initialize.mockResolvedValue(
    ok({ authorizationUrl: "https://checkout.paystack.com/x" }),
  );
});

describe("startCheckoutAction", () => {
  it("starts a pack at the config price with the app's callback URL (AC-13)", async () => {
    const result = await startCheckoutAction("p100", CHAT);
    expect(result).toEqual(
      ok({ authorizationUrl: "https://checkout.paystack.com/x" }),
    );
    expect(claimGrants).toHaveBeenCalledWith(USER);
    expect(initialize).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        amountKobo: 1_000_000,
        reference: PAYMENT,
        callbackUrl: `https://app.test/credits/callback?returnTo=${CHAT}`,
      }),
    );
  });

  it("applies the 10 an hour checkout limit to this user", async () => {
    allowCheckout.mockResolvedValue(false);
    expect(await startCheckoutAction("p100", null)).toEqual({
      ok: false,
      error: { code: "rate_limited" },
    });
    expect(allowCheckout).toHaveBeenCalledWith(USER, {
      window: 3600,
      max: 10,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty pack id", "", null],
    ["an oversized pack id", "p".repeat(33), null],
    ["an oversized returnTo", "p100", "x".repeat(65)],
  ])("refuses %s before reading the session", async (_, packId, returnTo) => {
    expect(await startCheckoutAction(packId, returnTo)).toEqual({
      ok: false,
      error: { code: "unknown_pack" },
    });
    expect(sessionAccount).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a guest with not_signed_in and makes no payment (AC-8)", async () => {
    sessionAccount.mockResolvedValue({
      id: USER,
      isAnonymous: true,
      email: "guest@anon.local",
    });
    expect(await startCheckoutAction("p100", null)).toEqual({
      ok: false,
      error: { code: "not_signed_in" },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
