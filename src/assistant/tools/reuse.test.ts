import { describe, expect, it } from "vitest";
import { sampleTool } from "@/tools/test-tools/sample";
import { acceptedAnswers, reuseDay } from "./reuse";

// Spec 0011, AC-4 and AC-6.

describe("reuseDay", () => {
  it("formats a stored timestamp as a short day in Lagos", () => {
    expect(reuseDay("2026-11-24 10:00:00.123456+00", "Africa/Lagos")).toBe(
      "24 Nov",
    );
    expect(reuseDay("2026-11-24T10:00:00Z", "Africa/Lagos")).toBe("24 Nov");
  });

  it("uses the Lagos day, not the UTC day", () => {
    // 23:30 UTC is 00:30 the next day in Lagos (UTC+1).
    expect(reuseDay("2026-11-24 23:30:00+00", "Africa/Lagos")).toBe("25 Nov");
  });

  it("returns null for text that is not a timestamp", () => {
    expect(reuseDay("not a date", "Africa/Lagos")).toBeNull();
  });
});

describe("acceptedAnswers", () => {
  it("keeps answers that fit, with their sources, and drops the rest", () => {
    expect(
      acceptedAnswers(sampleTool, [
        { questionId: "stage", value: "idea", source: "profile" },
        { questionId: "team_size", value: 13, source: "client" },
        { questionId: "unknown", value: "x", source: "client" },
        { questionId: "confidence", value: 3, source: "client" },
      ]),
    ).toEqual([
      { questionId: "stage", value: "idea", source: "profile" },
      { questionId: "confidence", value: 3, source: "client" },
    ]);
  });
});
