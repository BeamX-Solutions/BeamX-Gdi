import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL } from "@/legal/config";

// The updated terms card's OK (spec 0017, AC-6): only a signed in account records the
// current version of both policies, as the card says. The session and the policy write are mocked at the boundary.

const { sessionUser, record, logEvent } = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  record: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/auth/session", () => ({ sessionUser }));
vi.mock("@/db/queries/policies", () => ({ record }));
vi.mock("@/lib/log", () => ({ logEvent }));

const { acceptTermsAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue(undefined);
});

describe("acceptTermsAction", () => {
  it("records the current terms and privacy versions for an account (AC-6)", async () => {
    sessionUser.mockResolvedValue({ id: "u1", isAnonymous: false });
    expect(await acceptTermsAction()).toEqual({ ok: true, value: null });
    expect(record).toHaveBeenCalledWith("u1", [
      { policy: "terms", version: LEGAL.termsVersion },
      { policy: "privacy", version: LEGAL.privacyVersion },
    ]);
  });

  it("refuses a guest and records nothing (AC-5: guests are covered by the notice)", async () => {
    sessionUser.mockResolvedValue({ id: "g1", isAnonymous: true });
    expect(await acceptTermsAction()).toEqual({
      ok: false,
      error: { code: "not_signed_in" },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses a request with no session", async () => {
    sessionUser.mockResolvedValue(null);
    expect(await acceptTermsAction()).toMatchObject({ ok: false });
    expect(record).not.toHaveBeenCalled();
  });

  it("logs the user id and versions only", async () => {
    sessionUser.mockResolvedValue({ id: "u1", isAnonymous: false });
    await acceptTermsAction();
    expect(logEvent).toHaveBeenCalledWith("policies_accepted", {
      userId: "u1",
      terms: LEGAL.termsVersion,
      privacy: LEGAL.privacyVersion,
    });
  });
});
