import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  parseAdjustArgs,
  parseLunaCsv,
  signupEmailHash,
} from "./money-ops";

// Spec 0004, milestone 4: the sign up grant hash (AC-11), the Luna CSV (AC-16) and the
// adjust arguments (AC-17).

const SECRET = "s".repeat(32);

describe("signupEmailHash (AC-11)", () => {
  it("is the same for any case or surrounding spaces", () => {
    expect(signupEmailHash("  Ada@Example.com ", SECRET)).toBe(
      signupEmailHash("ada@example.com", SECRET),
    );
  });

  it("is keyed: another secret gives another hash, and no email is readable", () => {
    const a = signupEmailHash("ada@example.com", SECRET);
    const b = signupEmailHash("ada@example.com", "t".repeat(32));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("ada");
  });

  it("normalizeEmail lowercases and trims", () => {
    expect(normalizeEmail(" A@B.CO ")).toBe("a@b.co");
  });
});

describe("parseLunaCsv (AC-16)", () => {
  it("parses rows at the rate, normalizing emails, skipping blank lines", () => {
    const csv =
      "email,luna_credits\r\n Ada@Example.com ,5\r\n\r\nbo@x.co,12\r\n";
    expect(parseLunaCsv(csv, 10)).toEqual({
      ok: true,
      value: [
        { email: "ada@example.com", lunaCredits: 5, credits: 50 },
        { email: "bo@x.co", lunaCredits: 12, credits: 120 },
      ],
    });
  });

  it("refuses a missing or wrong header", () => {
    expect(parseLunaCsv("", 10).ok).toBe(false);
    expect(parseLunaCsv("mail,credits\na@b.co,1", 10)).toEqual({
      ok: false,
      error: [{ line: 1, reason: "header must be email,luna_credits" }],
    });
  });

  it("is all or nothing, listing every bad line with its number", () => {
    const csv = [
      "email,luna_credits",
      "ok@x.co,3",
      "not-an-email,3",
      "zero@x.co,0",
      "frac@x.co,1.5",
      "OK@x.co,4",
      "a@x.co,1,extra",
    ].join("\n");
    expect(parseLunaCsv(csv, 10)).toEqual({
      ok: false,
      error: [
        { line: 3, reason: "invalid email" },
        { line: 4, reason: "luna_credits must be a whole number above 0" },
        { line: 5, reason: "luna_credits must be a whole number above 0" },
        { line: 6, reason: "email appears twice" },
        { line: 7, reason: "expected 2 columns" },
      ],
    });
  });

  it("accepts a header with no rows as an empty import", () => {
    expect(parseLunaCsv("email,luna_credits\n", 10)).toEqual({
      ok: true,
      value: [],
    });
  });
});

describe("parseAdjustArgs (AC-17)", () => {
  const good = [
    "Ada@Example.com",
    "-20",
    "--reason",
    "refund for a failed report",
    "--actor",
    "Staff@BeamX.co",
  ];

  it("parses a signed amount and normalizes both emails", () => {
    expect(parseAdjustArgs(good)).toEqual({
      ok: true,
      value: {
        email: "ada@example.com",
        amount: -20,
        reason: "refund for a failed report",
        actor: "staff@beamx.co",
        yes: false,
      },
    });
    expect(parseAdjustArgs([...good, "--yes"])).toMatchObject({
      ok: true,
      value: { yes: true },
    });
  });

  it("requires the reason and the actor", () => {
    expect(parseAdjustArgs(["a@b.co", "5", "--actor", "s@b.co"])).toEqual({
      ok: false,
      error: "--reason is required",
    });
    expect(parseAdjustArgs(["a@b.co", "5", "--reason", "goodwill"])).toEqual({
      ok: false,
      error: "--actor must be a staff email",
    });
    expect(parseAdjustArgs(["a@b.co", "5", "--reason"]).ok).toBe(false);
  });

  it("refuses 0, a fraction, a bad email, extra or unknown arguments", () => {
    const flags = ["--reason", "goodwill", "--actor", "s@b.co"];
    expect(parseAdjustArgs(["a@b.co", "0", ...flags])).toEqual({
      ok: false,
      error: "amount must not be 0",
    });
    expect(parseAdjustArgs(["a@b.co", "1.5", ...flags]).ok).toBe(false);
    expect(parseAdjustArgs(["nope", "5", ...flags]).ok).toBe(false);
    expect(parseAdjustArgs(["a@b.co", "5", "6", ...flags]).ok).toBe(false);
    expect(parseAdjustArgs(["a@b.co", "5", ...flags, "--force"])).toEqual({
      ok: false,
      error: "unknown flag --force",
    });
  });
});
