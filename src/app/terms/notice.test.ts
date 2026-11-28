import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL } from "@/legal/config";

// Who sees the updated terms card (spec 0017, AC-6): a signed in account whose newest
// accepted terms version is not the current one. The policy read is mocked.

const { newestVersion } = vi.hoisted(() => ({ newestVersion: vi.fn() }));

vi.mock("@/db/queries/policies", () => ({ newestVersion }));
vi.mock("./actions", () => ({ acceptTermsAction: vi.fn() }));

const { needsTermsCard } = await import("./notice");

beforeEach(() => vi.clearAllMocks());

describe("needsTermsCard (AC-6)", () => {
  const account = { id: "u1", isAnonymous: false };

  it("shows the card to an account on an older terms version", async () => {
    newestVersion.mockResolvedValue("2000-01-01");
    expect(await needsTermsCard(account)).toBe(true);
    expect(newestVersion).toHaveBeenCalledWith("u1", "terms");
  });

  it("shows the card to an account with no terms row (a missed sign up record)", async () => {
    newestVersion.mockResolvedValue(null);
    expect(await needsTermsCard(account)).toBe(true);
  });

  it("hides the card once the current version is accepted", async () => {
    newestVersion.mockResolvedValue(LEGAL.termsVersion);
    expect(await needsTermsCard(account)).toBe(false);
  });

  it("never shows it to a guest or without a session, and reads nothing", async () => {
    expect(await needsTermsCard({ id: "g1", isAnonymous: true })).toBe(false);
    expect(await needsTermsCard(null)).toBe(false);
    expect(newestVersion).not.toHaveBeenCalled();
  });
});
