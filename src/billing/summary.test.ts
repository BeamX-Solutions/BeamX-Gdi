import { describe, expect, it } from "vitest";
import { billingConfig } from "./config";
import { expiryWarning, toCreditSummary } from "./summary";

// Spec 0004, AC-15: the chip's warning dot from 30 days before the Lagos expiry date.

const at = (lastActivityAt: string, balance = 30) => ({
  balance,
  lastActivityAt,
});

describe("expiryWarning (AC-15)", () => {
  // Last activity 15 Jan 2026 (Lagos) expires 15 Jan 2027; the warning starts 16 Dec 2026.
  const last = "2026-01-15T10:00:00Z";

  it("is off before the warning window", () => {
    expect(
      expiryWarning(at(last), new Date("2026-12-15T12:00:00Z"), billingConfig),
    ).toBe(false);
  });

  it("is on from 30 days before expiry, on the Lagos date", () => {
    // 23:30 UTC on 15 Dec is already 16 Dec in Lagos.
    expect(
      expiryWarning(at(last), new Date("2026-12-15T23:30:00Z"), billingConfig),
    ).toBe(true);
  });

  it("stays on after the expiry date while expiry is not enforced", () => {
    expect(
      expiryWarning(at(last), new Date("2027-02-01T12:00:00Z"), billingConfig),
    ).toBe(true);
  });

  it("is off with no account or nothing to lose", () => {
    const late = new Date("2027-02-01T12:00:00Z");
    expect(expiryWarning(null, late, billingConfig)).toBe(false);
    expect(expiryWarning(at(last, 0), late, billingConfig)).toBe(false);
  });
});

describe("toCreditSummary", () => {
  it("keeps only available and held", () => {
    expect(
      toCreditSummary({ available: 20, held: 10, balance: 30 } as never),
    ).toEqual({ available: 20, held: 10 });
    expect(toCreditSummary(null)).toBeNull();
  });
});
