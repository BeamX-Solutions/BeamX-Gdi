import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL } from "@/legal/config";

// Who sees the updated terms card (spec 0017, AC-6): a signed in account behind on the
// terms or the privacy notice. The policy read is mocked.

const { newestVersions } = vi.hoisted(() => ({ newestVersions: vi.fn() }));

vi.mock("@/db/queries/policies", () => ({ newestVersions }));
vi.mock("./actions", () => ({ acceptTermsAction: vi.fn() }));

const { needsTermsCard } = await import("./notice");

const current = { terms: LEGAL.termsVersion, privacy: LEGAL.privacyVersion };

beforeEach(() => vi.clearAllMocks());

describe("needsTermsCard (AC-6)", () => {
  const account = { id: "u1", isAnonymous: false };

  it("shows the card to an account on an older terms version", async () => {
    newestVersions.mockResolvedValue({ ...current, terms: "2000-01-01" });
    expect(await needsTermsCard(account)).toBe(true);
    expect(newestVersions).toHaveBeenCalledWith("u1");
  });

  it("shows the card when only the privacy notice changed", async () => {
    newestVersions.mockResolvedValue({ ...current, privacy: "2000-01-01" });
    expect(await needsTermsCard(account)).toBe(true);
  });

  it("shows the card to an account with no rows (a missed sign up record)", async () => {
    newestVersions.mockResolvedValue({ terms: null, privacy: null });
    expect(await needsTermsCard(account)).toBe(true);
  });

  it("hides the card once both current versions are accepted", async () => {
    newestVersions.mockResolvedValue(current);
    expect(await needsTermsCard(account)).toBe(false);
  });

  it("never shows it to a guest or without a session, and reads nothing", async () => {
    expect(await needsTermsCard({ id: "g1", isAnonymous: true })).toBe(false);
    expect(await needsTermsCard(null)).toBe(false);
    expect(newestVersions).not.toHaveBeenCalled();
  });
});
