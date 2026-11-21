import { describe, expect, it } from "vitest";
import {
  balanceLine,
  confirmTitle,
  credits,
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
