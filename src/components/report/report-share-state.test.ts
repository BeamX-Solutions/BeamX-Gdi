import { describe, expect, it } from "vitest";
import { shareCopy } from "./report-share-state";

// Spec 0015, AC-6: the share row's note.

describe("shareCopy.note", () => {
  it("says nothing before a send, and names the masked address after", () => {
    expect(shareCopy.note({ kind: "idle" })).toBe("");
    expect(shareCopy.note({ kind: "sending" })).toBe("");
    expect(shareCopy.note({ kind: "sent", sentTo: "a***@gmail.com" })).toBe(
      "Sent to a***@gmail.com",
    );
  });

  it("points to the PDF when the email can't go", () => {
    expect(shareCopy.note({ kind: "failed", reason: "limit" })).toContain(
      "this hour",
    );
    expect(shareCopy.note({ kind: "failed", reason: "send" })).toContain(
      "download the PDF",
    );
  });
});
