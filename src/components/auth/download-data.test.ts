import { describe, expect, it } from "vitest";
import { downloadErrorMessage, fileNameFrom } from "./download-data";

describe("downloadErrorMessage", () => {
  it("explains the limit, no session, and anything else", () => {
    expect(downloadErrorMessage(429)).toMatch(/this hour/);
    expect(downloadErrorMessage(401)).toMatch(/no data/);
    expect(downloadErrorMessage(500)).toMatch(/couldn't prepare/);
    expect(downloadErrorMessage(0)).toMatch(/couldn't prepare/);
  });
});

describe("fileNameFrom", () => {
  it("takes the server's file name", () => {
    expect(
      fileNameFrom(
        'attachment; filename="beamx-data-2026-11-28.json"',
        "2000-01-01",
      ),
    ).toBe("beamx-data-2026-11-28.json");
  });

  it("falls back to a dated name", () => {
    expect(fileNameFrom(null, "2026-11-28")).toBe("beamx-data-2026-11-28.json");
  });
});
