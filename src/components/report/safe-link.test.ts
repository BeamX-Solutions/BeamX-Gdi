import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "./safe-link";

describe("safeHttpsUrl", () => {
  it("keeps an https URL", () => {
    expect(safeHttpsUrl("https://example.com/guide?a=1")).toBe(
      "https://example.com/guide?a=1",
    );
  });

  it("trims spaces around the URL", () => {
    expect(safeHttpsUrl("  https://example.com  ")).toBe(
      "https://example.com/",
    );
  });

  it.each([
    null,
    "http://example.com",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,hi",
    "/relative/path",
    "example.com",
    "",
    "not a url",
  ])("drops %s", (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });
});
