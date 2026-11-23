import { describe, expect, it } from "vitest";
import {
  balanceLine,
  buyLabel,
  checkoutErrorLine,
  confirmTitle,
  credits,
  expiryBannerLine,
  formatDay,
  formatEntryTime,
  paymentBanner,
  paymentToast,
  packLine,
  priceLine,
  shortfallLine,
  stopTitle,
} from "./credit-copy";

describe("credit copy", () => {
  it("says credit or credits", () => {
    expect(credits(1)).toBe("1 credit");
    expect(credits(0)).toBe("0 credits");
    expect(credits(1000)).toBe("1,000 credits");
  });

  it("names the tool on the confirm card when known (AC-3)", () => {
    expect(confirmTitle("startRun", "Stellar")).toBe("Start Stellar?");
    expect(confirmTitle("startRun", null)).toBe("Start this check?");
    expect(confirmTitle("resumeRun", null)).toBe("Continue your run?");
    expect(confirmTitle("restartRun", "Stellar")).toBe(
      "Start again with your answers?",
    );
  });

  it("shows the price and the balance (AC-3)", () => {
    expect(priceLine(30)).toBe("This uses 30 credits.");
    expect(balanceLine(30)).toBe("You have 30 credits available.");
    expect(balanceLine(null)).toBeNull();
  });

  it("names held credits on the stop card only when there are some", () => {
    expect(stopTitle(30)).toBe(
      "Stop this run? Your 30 credits held will be returned.",
    );
    expect(stopTitle(0)).toBe("Stop this run?");
  });

  it("says the shortfall and the pack price in naira (AC-10)", () => {
    expect(shortfallLine(30)).toBe("You need 30 credits more for this run.");
    expect(packLine({ id: "p", credits: 100, priceNgn: 10_000 })).toBe(
      "100 credits for ₦10,000",
    );
  });
});

describe("buying copy (spec 0004, AC-8, AC-13, AC-15, AC-21)", () => {
  it("labels each Buy button with the pack", () => {
    expect(buyLabel({ id: "p100", credits: 100, priceNgn: 10_000 })).toBe(
      "Buy 100 credits for ₦10,000",
    );
  });

  it("has a friendly line for every checkout failure", () => {
    for (const code of [
      "not_signed_in",
      "unknown_pack",
      "rate_limited",
      "paystack_unavailable",
    ] as const)
      expect(checkoutErrorLine(code).length).toBeGreaterThan(10);
    expect(checkoutErrorLine("paystack_unavailable")).toContain("not charged");
  });

  it("toasts only good news in the chat; failures go to /credits", () => {
    expect(paymentToast("succeeded")).toContain("credits are ready");
    expect(paymentToast("pending")).toContain("shortly");
    expect(paymentToast("failed")).toBeNull();
    expect(paymentToast("not_found")).toBeNull();
  });

  it("gives /credits a banner for every outcome", () => {
    expect(paymentBanner("succeeded").tone).toBe("ok");
    expect(paymentBanner("pending").tone).toBe("ok");
    expect(paymentBanner("failed").tone).toBe("error");
    expect(paymentBanner("not_found").tone).toBe("error");
  });

  it("formats the expiry day and banner", () => {
    expect(formatDay("2027-03-12")).toBe("12 March 2027");
    expect(expiryBannerLine("12 March 2027", false)).toContain(
      "expires on 12 March 2027",
    );
    expect(expiryBannerLine("12 March 2027", true)).toContain(
      "reached its expiry date",
    );
  });

  it("shows history times in Lagos time", () => {
    // 23:30 UTC is 00:30 the next day in Lagos (UTC+1).
    expect(formatEntryTime("2026-11-23 23:30:00+00", "Africa/Lagos")).toContain(
      "24 Nov 2026",
    );
  });
});
