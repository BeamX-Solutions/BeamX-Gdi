import { describe, expect, it } from "vitest";
import { typedEmailMatches } from "./delete-account";

// Spec 0009, AC-13: the typed email must be the account's, checked the same way in the
// dialog and in `/api/account/delete`.

describe("typedEmailMatches", () => {
  it("accepts the account's email, ignoring case and outer spaces", () => {
    expect(typedEmailMatches(" Ada@Example.com ", "ada@example.com")).toBe(
      true,
    );
  });

  it("refuses another email, a near miss, or nothing typed", () => {
    expect(typedEmailMatches("bob@example.com", "ada@example.com")).toBe(false);
    expect(typedEmailMatches("ada@example.co", "ada@example.com")).toBe(false);
    expect(typedEmailMatches("", "")).toBe(false);
    expect(typedEmailMatches("   ", "ada@example.com")).toBe(false);
  });
});
