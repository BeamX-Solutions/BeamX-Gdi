import { describe, expect, it } from "vitest";
import { prefillResponseText, reportTitle } from "./chat-copy";

describe("prefillResponseText", () => {
  it("says what was kept and what is changing", () => {
    expect(prefillResponseText(1, null)).toBe("Use this answer");
    expect(prefillResponseText(3, null)).toBe("Use these 3 answers");
    expect(prefillResponseText(2, "Who buys?")).toBe(
      'Use these 2 answers, and change "Who buys?"',
    );
    expect(prefillResponseText(0, "Who buys?")).toBe('Change "Who buys?"');
    expect(prefillResponseText(0, null)).toBe("Got it");
  });
});

describe("reportTitle", () => {
  it("names the report after its tool", () => {
    expect(reportTitle("Stellar")).toBe("Stellar report");
  });
});
