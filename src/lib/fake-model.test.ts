import { describe, expect, it } from "vitest";
import { chatScript, FAKE_REPLIES } from "./fake-model";

// Spec 0007: the e2e chat script, keyed by the latest user text.

type Prompt = Parameters<typeof chatScript>[0];

const user = (text: string): Prompt[number] => ({
  role: "user",
  content: [{ type: "text", text }],
});
const note: Prompt[number] = { role: "system", content: "run state" };

const textOf = (parts: ReturnType<typeof chatScript>) =>
  parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");

describe("chatScript", () => {
  it("proposes Stellar for a business idea, even with the run state note last", () => {
    const parts = chatScript([user("I have a business idea: a bakery"), note]);
    expect(parts[0]).toMatchObject({
      type: "tool-call",
      toolName: "startRun",
      input: JSON.stringify({ toolId: "stellar" }),
    });
  });

  it("acknowledges an approved run (a tool result last)", () => {
    const parts = chatScript([
      user("I have a business idea"),
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "startRun",
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
      note,
    ]);
    expect(textOf(parts)).toBe(FAKE_REPLIES.approved);
  });

  it("steers anything else towards a tool", () => {
    expect(textOf(chatScript([user("What can BeamX do?")]))).toBe(
      FAKE_REPLIES.steer,
    );
  });
});
