import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  ledgerLabel,
  signedAmount,
} from "./history";

// Spec 0004, AC-14: the history page's cursor and wording.

describe("history cursor", () => {
  const last = {
    createdAt: "2026-11-23 10:00:00.123456+00",
    id: "0190a1b2-0000-7000-8000-000000000001",
  };

  it("round trips the raw timestamp, microseconds kept", () => {
    expect(decodeCursor(encodeCursor(last))).toEqual(last);
  });

  it("treats anything else as the first page", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(["a", "b"])).toBeNull();
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify({ c: "yesterday", i: last.id })).toString(
          "base64url",
        ),
      ),
    ).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(
          JSON.stringify({ c: last.createdAt, i: "1; drop table" }),
        ).toString("base64url"),
      ),
    ).toBeNull();
    expect(decodeCursor("x".repeat(500))).toBeNull();
  });
});

describe("history wording", () => {
  it("labels each kind", () => {
    expect(ledgerLabel("purchase")).toBe("Credits bought");
    expect(ledgerLabel("run_charge")).toBe("Tool run");
    expect(ledgerLabel("guest_grant_forfeit")).toBe("Unused guest credits");
  });

  it("signs amounts with a real minus sign", () => {
    expect(signedAmount(100)).toBe("+100");
    expect(signedAmount(-30)).toBe("−30");
    expect(signedAmount(1000)).toBe("+1,000");
  });
});
