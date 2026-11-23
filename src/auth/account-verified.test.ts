import { describe, expect, it, vi } from "vitest";
import { afterUserWrite, isVerifiedAccount } from "./account-verified";

describe("afterUserWrite (spec 0009, AC-16)", () => {
  const account = { id: "u1", emailVerified: true, isAnonymous: false };

  it("calls the hook for a verified, non guest user", async () => {
    const verified = vi.fn(async () => {});
    await afterUserWrite(verified)(account);
    expect(verified).toHaveBeenCalledWith("u1");
  });

  it("skips guests and unverified users", async () => {
    const verified = vi.fn(async () => {});
    const hook = afterUserWrite(verified);
    await hook({ id: "g", emailVerified: false, isAnonymous: true });
    await hook({ id: "g2", emailVerified: true, isAnonymous: true });
    await hook({ id: "u2", emailVerified: false, isAnonymous: false });
    expect(verified).not.toHaveBeenCalled();
  });

  it("treats a missing isAnonymous as a real account", () => {
    expect(isVerifiedAccount({ id: "u", emailVerified: true })).toBe(true);
    expect(
      isVerifiedAccount({ id: "u", emailVerified: true, isAnonymous: null }),
    ).toBe(true);
  });

  it("is safe to call many times", async () => {
    const verified = vi.fn(async () => {});
    const hook = afterUserWrite(verified);
    await hook(account);
    await hook(account);
    expect(verified).toHaveBeenCalledTimes(2);
  });

  it("logs a failing hook and never throws", async () => {
    const log = vi.fn();
    const hook = afterUserWrite(async () => {
      throw new Error("grant failed");
    }, log);
    await expect(hook(account)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("account_verified_failed", {
      userId: "u1",
    });
  });
});
