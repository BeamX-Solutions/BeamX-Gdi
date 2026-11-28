import { describe, expect, it, vi } from "vitest";
import { LEGAL } from "@/legal/config";

vi.mock("./grants", () => ({ claimGrants: vi.fn() }));
vi.mock("@/lib/log", () => ({ logEvent: vi.fn() }));

const { afterAccountCreated, signUpAcceptances } =
  await import("./policy-acceptance");

describe("afterAccountCreated (spec 0017, AC-5)", () => {
  const account = { id: "u1", emailVerified: true, isAnonymous: false };

  it("records the current terms and privacy versions for a new account", async () => {
    const record = vi.fn(async () => {});
    await afterAccountCreated(record, vi.fn())(account);
    expect(record).toHaveBeenCalledWith("u1", [
      { policy: "terms", version: LEGAL.termsVersion },
      { policy: "privacy", version: LEGAL.privacyVersion },
    ]);
  });

  it("records nothing for a guest or an unverified user", async () => {
    const record = vi.fn(async () => {});
    const hook = afterAccountCreated(record, vi.fn());
    await hook({ id: "g", emailVerified: false, isAnonymous: true });
    await hook({ id: "u2", emailVerified: false, isAnonymous: false });
    expect(record).not.toHaveBeenCalled();
  });

  it("logs a failed record and never throws", async () => {
    const log = vi.fn();
    const hook = afterAccountCreated(async () => {
      throw new Error("db down");
    }, log);
    await expect(hook(account)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("policy_record_failed", { userId: "u1" });
  });

  it("accepts both policies", () => {
    expect(signUpAcceptances().map((a) => a.policy)).toEqual([
      "terms",
      "privacy",
    ]);
  });
});
