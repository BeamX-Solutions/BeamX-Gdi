import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../id";
import { guestTracker, unwrap } from "../test/helpers";
import * as conversations from "./conversations";
import * as messages from "./messages";
import * as runs from "./runs";

// Spec 0007, step 4: `conversations.turnContext`, the chat route's one round trip.

const tracker = guestTracker();
afterAll(tracker.cleanup);

const text = (t: string) => ({
  id: newId(),
  role: "user" as const,
  parts: [{ type: "text", text: t }],
});

const tap = () => ({
  id: newId(),
  role: "user" as const,
  parts: [
    {
      type: "data-answer",
      data: { runId: newId(), questionId: "q1", value: "a" },
    },
  ],
});

describe("conversations.turnContext", () => {
  it("creates the chat under the client id on first use, and again changes nothing", async () => {
    const userId = await tracker.guest();
    const id = newId();

    const first = unwrap(await conversations.turnContext(userId, id));
    expect(first).toEqual({
      active: { active: null, paused: [] },
      typedInRun: 0,
    });
    expect(unwrap(await conversations.ownerOf(id))).toBe(userId);

    const again = await conversations.turnContext(userId, id);
    expect(again.ok).toBe(true);
  });

  it("refuses another user's chat and writes nothing to it", async () => {
    const owner = await tracker.guest();
    const stranger = await tracker.guest();
    const id = newId();
    unwrap(await conversations.turnContext(owner, id));

    expect(await conversations.turnContext(stranger, id)).toEqual({
      ok: false,
      error: { code: "other_owner" },
    });
    expect(unwrap(await conversations.ownerOf(id))).toBe(owner);
  });

  it("counts only typed user messages written since the active run started", async () => {
    const userId = await tracker.guest();
    const id = newId();
    unwrap(await conversations.turnContext(userId, id));

    // Before the run: never counted.
    unwrap(await messages.append(userId, id, [text("I have a business idea")]));
    const started = await runs.start(userId, id, "stellar", "1");
    if (!started.ok) throw new Error("start failed");

    unwrap(
      await messages.append(userId, id, [
        text("what does this mean?"),
        tap(),
        {
          id: newId(),
          role: "assistant",
          parts: [{ type: "text", text: "It means…" }],
        },
        text("thanks"),
      ]),
    );

    const context = unwrap(await conversations.turnContext(userId, id));
    expect(context.active.active?.run.id).toBe(started.value.run.id);
    expect(context.typedInRun).toBe(2);
  });

  it("counts nothing when no run is active", async () => {
    const userId = await tracker.guest();
    const id = newId();
    unwrap(await conversations.turnContext(userId, id));
    unwrap(await messages.append(userId, id, [text("hi"), text("hello?")]));
    expect(unwrap(await conversations.turnContext(userId, id)).typedInRun).toBe(
      0,
    );
  });
});
