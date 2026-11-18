import { describe, expect, it } from "vitest";
import { nextAnnouncement } from "./announce";
import type { MessageView } from "./types";

const msg = (
  over: Partial<MessageView> & Pick<MessageView, "id">,
): MessageView => ({
  role: "assistant",
  markdown: "text",
  streaming: false,
  ...over,
});

const prev = (
  messages: readonly MessageView[],
  status: string | null,
  announcement = "",
) => ({
  messages,
  status,
  announcement,
});

describe("nextAnnouncement (AC-6)", () => {
  it("announces the full text once when a reply stops streaming", () => {
    const before = prev(
      [msg({ id: "a", markdown: "Hel", streaming: true })],
      null,
    );
    const after = [msg({ id: "a", markdown: "Hello there", streaming: false })];
    expect(nextAnnouncement(before, after, null)).toBe("Hello there");
  });

  it("says nothing while text is still streaming, however it grows", () => {
    const before = prev(
      [msg({ id: "a", markdown: "Hel", streaming: true })],
      null,
      "old",
    );
    const after = [msg({ id: "a", markdown: "Hello", streaming: true })];
    expect(nextAnnouncement(before, after, null)).toBe("old");
  });

  it("does not re-announce a finished reply on the next change", () => {
    const done = msg({ id: "a", markdown: "Done", streaming: false });
    const before = prev([done], null, "Done");
    expect(
      nextAnnouncement(before, [done, msg({ id: "b", role: "user" })], null),
    ).toBe("Done");
  });

  it("does not announce user messages or replies that arrive already finished", () => {
    const before = prev([], null);
    expect(
      nextAnnouncement(before, [msg({ id: "u", role: "user" })], null),
    ).toBe("");
    expect(nextAnnouncement(before, [msg({ id: "a" })], null)).toBe("");
  });

  it("announces each new status text, not the same one twice or null", () => {
    const m: readonly MessageView[] = [];
    expect(nextAnnouncement(prev(m, null), m, "Scoring your answers…")).toBe(
      "Scoring your answers…",
    );
    expect(
      nextAnnouncement(
        prev(m, "Scoring your answers…", "Scoring your answers…"),
        m,
        "Scoring your answers…",
      ),
    ).toBe("Scoring your answers…");
    expect(nextAnnouncement(prev(m, "Scoring", "Scoring"), m, null)).toBe(
      "Scoring",
    );
  });
});
