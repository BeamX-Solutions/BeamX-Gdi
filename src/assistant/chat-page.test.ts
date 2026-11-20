import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { loadChat, toUIMessages } from "./chat-page";

// Spec 0007, AC-5, AC-7: what `/c/[id]` shows for its owner, a stranger, and a new id.

const USER = "u1";
const ROWS = [
  { id: "s", role: "system" as const, parts: [{ type: "text", text: "x" }] },
  { id: "m1", role: "user" as const, parts: [{ type: "text", text: "hi" }] },
  {
    id: "m2",
    role: "assistant" as const,
    parts: [{ type: "text", text: "yo" }],
  },
];

describe("loadChat", () => {
  it("shows the owner's saved thread in one read", async () => {
    const ownerOf = vi.fn();
    const page = await loadChat(
      { open: async () => ok({ messages: ROWS }), ownerOf },
      USER,
      "c1",
    );
    expect(page).toEqual({ kind: "chat", messages: toUIMessages(ROWS) });
    expect(ownerOf).not.toHaveBeenCalled();
  });

  it("is not found for a chat that belongs to someone else", async () => {
    const page = await loadChat(
      {
        open: async () => err({ code: "not_found" }),
        ownerOf: async () => ok("someone-else"),
      },
      USER,
      "c1",
    );
    expect(page).toEqual({ kind: "not_found" });
  });

  it("is not found for an existing chat when there is no session", async () => {
    const open = vi.fn();
    const page = await loadChat(
      { open, ownerOf: async () => ok("someone") },
      null,
      "c1",
    );
    expect(page).toEqual({ kind: "not_found" });
    expect(open).not.toHaveBeenCalled();
  });

  it("shows the empty chat for an unknown id", async () => {
    const page = await loadChat(
      {
        open: async () => err({ code: "not_found" }),
        ownerOf: async () => err({ code: "not_found" }),
      },
      USER,
      "c1",
    );
    expect(page).toEqual({ kind: "chat", messages: [] });
  });
});

describe("toUIMessages", () => {
  it("drops system rows and rows without a parts array", () => {
    const messages = toUIMessages([
      ...ROWS,
      { id: "bad", role: "user", parts: "nope" },
    ]);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
