import { describe, expect, it } from "vitest";
import { billingConfig as cfg } from "./config";
import {
  addMonths,
  available,
  chatCharge,
  chatChargeOnStop,
  coveringPacks,
  expiryDate,
  expiryState,
  localDate,
  priceStillValid,
  shortfall,
} from "./pricing";

describe("balance math", () => {
  it("available is balance minus held, 0 with no account", () => {
    expect(available({ balance: 50, held: 30 })).toBe(20);
    expect(available(null)).toBe(0);
  });

  it("shortfall never goes negative", () => {
    expect(shortfall(30, 10)).toBe(20);
    expect(shortfall(30, 50)).toBe(0);
  });

  it("price must match the approved card (AC-2)", () => {
    expect(priceStillValid(30, 30)).toBe(true);
    expect(priceStillValid(30, 40)).toBe(false);
  });
});

describe("coveringPacks (AC-8)", () => {
  it("returns packs that cover the shortfall, cheapest first", () => {
    expect(coveringPacks(cfg.packs, 150).map((p) => p.id)).toEqual([
      "p300",
      "p1000",
    ]);
    expect(coveringPacks(cfg.packs, 1).map((p) => p.id)).toEqual([
      "p100",
      "p300",
      "p1000",
    ]);
  });

  it("falls back to the largest pack when none covers it", () => {
    expect(coveringPacks(cfg.packs, 5000).map((p) => p.id)).toEqual(["p1000"]);
  });
});

describe("chatCharge (AC-10)", () => {
  it("rounds a cheap reply up to 1 credit", () => {
    // $0.004 * 1700 * 3 / 100 = 0.204
    expect(chatCharge(0.004, cfg)).toBe(1);
  });

  it("never charges below 1, even for zero cost", () => {
    expect(chatCharge(0, cfg)).toBe(1);
  });

  it("rounds up partial credits", () => {
    // $0.03 * 1700 * 3 / 100 = 1.53
    expect(chatCharge(0.03, cfg)).toBe(2);
  });

  it("does not round up float noise on an exact credit", () => {
    // 1 credit exactly: 100 / (1700 * 3) dollars
    expect(chatCharge(100 / 5100, cfg)).toBe(1);
  });

  it("caps at the ceiling", () => {
    expect(chatCharge(1, cfg)).toBe(cfg.chat.ceilingCredits);
  });

  it("stop before any output charges 0; unknown usage charges 1", () => {
    expect(chatChargeOnStop(0.03, false, cfg)).toBe(0);
    expect(chatChargeOnStop(null, true, cfg)).toBe(1);
    expect(chatChargeOnStop(0.03, true, cfg)).toBe(2);
  });
});

describe("Lagos day (AC-9)", () => {
  it("switches day at Lagos midnight, not UTC midnight", () => {
    // Lagos is UTC+1, no daylight saving.
    expect(localDate(new Date("2026-11-19T22:59:00Z"), "Africa/Lagos")).toBe(
      "2026-11-19",
    );
    expect(localDate(new Date("2026-11-19T23:00:00Z"), "Africa/Lagos")).toBe(
      "2026-11-20",
    );
  });
});

describe("expiry (AC-15)", () => {
  it("adds calendar months, clamping the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
    expect(addMonths("2026-11-19", 12)).toBe("2027-11-19");
  });

  it("expires 12 calendar months after last activity (Lagos date)", () => {
    expect(expiryDate(new Date("2026-11-19T23:30:00Z"), cfg)).toBe(
      "2027-11-20",
    );
  });

  it("warns from 30 days before, expires on the day", () => {
    const last = new Date("2026-01-15T10:00:00Z");
    expect(expiryState(last, 100, new Date("2026-12-15T10:00:00Z"), cfg)).toBe(
      "ok",
    );
    expect(expiryState(last, 100, new Date("2026-12-16T10:00:00Z"), cfg)).toBe(
      "warn",
    );
    expect(expiryState(last, 100, new Date("2027-01-15T10:00:00Z"), cfg)).toBe(
      "expired",
    );
  });

  it("an empty balance never warns", () => {
    const last = new Date("2025-01-01T10:00:00Z");
    expect(expiryState(last, 0, new Date("2027-01-01T10:00:00Z"), cfg)).toBe(
      "ok",
    );
  });
});
