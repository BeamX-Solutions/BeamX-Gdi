import { describe, expect, it, vi } from "vitest";
import { LEGAL } from "@/legal/config";

// Who sees the updated terms card (spec 0017, AC-6): a signed in account behind on the
// terms or the privacy notice. The policy read is passed in.

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { termsCardCheck } = await import("./terms-card");

const current = { terms: LEGAL.termsVersion, privacy: LEGAL.privacyVersion };
const account = { id: "u1", isAnonymous: false };

const check = (newestVersions: (userId: string) => Promise<unknown>) => {
  const deps = {
    newestVersions: vi.fn(newestVersions),
    log: vi.fn(),
  } as unknown as Parameters<typeof termsCardCheck>[0] & {
    readonly newestVersions: ReturnType<typeof vi.fn>;
    readonly log: ReturnType<typeof vi.fn>;
  };
  return { deps, needsTermsCard: termsCardCheck(deps) };
};

describe("needsTermsCard (AC-6)", () => {
  it("shows the card to an account on an older terms version", async () => {
    const { deps, needsTermsCard } = check(async () => ({
      ...current,
      terms: "2000-01-01",
    }));
    expect(await needsTermsCard(account)).toBe(true);
    expect(deps.newestVersions).toHaveBeenCalledWith("u1");
  });

  it("shows the card when only the privacy notice changed", async () => {
    const { needsTermsCard } = check(async () => ({
      ...current,
      privacy: "2000-01-01",
    }));
    expect(await needsTermsCard(account)).toBe(true);
  });

  it("shows the card to an account with no rows (a missed sign up record)", async () => {
    const { needsTermsCard } = check(async () => ({
      terms: null,
      privacy: null,
    }));
    expect(await needsTermsCard(account)).toBe(true);
  });

  it("hides the card once both current versions are accepted", async () => {
    const { needsTermsCard } = check(async () => current);
    expect(await needsTermsCard(account)).toBe(false);
  });

  it("never shows it to a guest or without a session, and reads nothing", async () => {
    const { deps, needsTermsCard } = check(async () => current);
    expect(await needsTermsCard({ id: "g1", isAnonymous: true })).toBe(false);
    expect(await needsTermsCard(null)).toBe(false);
    expect(deps.newestVersions).not.toHaveBeenCalled();
  });

  it("hides the card and logs when the lookup fails, never failing the page", async () => {
    const { deps, needsTermsCard } = check(async () => {
      throw new Error("neon timeout");
    });
    expect(await needsTermsCard(account)).toBe(false);
    expect(deps.log).toHaveBeenCalledWith("terms_check_failed", {
      userId: "u1",
    });
  });
});
