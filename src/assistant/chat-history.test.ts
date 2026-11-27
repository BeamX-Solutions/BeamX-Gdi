import { describe, expect, it } from "vitest";
import {
  chatTitle,
  historyEntries,
  reportsLine,
  UNTITLED,
} from "./chat-history";

// Feature #14: the history rail's items.

const names = (id: string) => ({ beacon: "Beacon", luna: "Luna" })[id] ?? id;

describe("chatTitle", () => {
  it("uses the stored title, else the first message text, else New chat", () => {
    expect(chatTitle({ title: "Bakery plan", firstUserParts: null })).toBe(
      "Bakery plan",
    );
    expect(
      chatTitle({
        title: null,
        firstUserParts: [
          { type: "data-question", data: {} },
          { type: "text", text: "  How healthy\n is my business?  " },
        ],
      }),
    ).toBe("How healthy is my business?");
    expect(chatTitle({ title: null, firstUserParts: [] })).toBe(UNTITLED);
    expect(chatTitle({ title: " ", firstUserParts: "junk" })).toBe(UNTITLED);
  });

  it("shortens a long first message", () => {
    const title = chatTitle({
      title: null,
      firstUserParts: [{ type: "text", text: "word ".repeat(30) }],
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("reportsLine", () => {
  it("names each tool once", () => {
    expect(reportsLine(["beacon"], names)).toBe("Beacon report");
    expect(reportsLine(["luna", "beacon", "beacon"], names)).toBe(
      "Luna and Beacon reports",
    );
    expect(reportsLine([], names)).toBeNull();
  });
});

describe("historyEntries", () => {
  it("links each chat", () => {
    expect(
      historyEntries(
        [
          {
            id: "c1",
            title: null,
            lastMessageAt: "x",
            firstUserParts: [{ type: "text", text: "Hi" }],
            readyToolIds: ["beacon"],
          },
        ],
        names,
      ),
    ).toEqual([
      { id: "c1", title: "Hi", href: "/c/c1", reports: "Beacon report" },
    ]);
  });
});
