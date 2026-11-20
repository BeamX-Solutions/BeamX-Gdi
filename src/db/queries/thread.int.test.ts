import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../id";
import * as conversations from "./conversations";
import * as messages from "./messages";
import * as reports from "./reports";
import * as runs from "./runs";
import { createGuest, deleteUser, fundRun } from "../test/helpers";

const guests: string[] = [];
afterAll(async () => {
  await Promise.all(guests.map(deleteUser));
});

describe("guest thread, end to end (AC-1)", () => {
  it("saves a chat, a run, answers, scores and a report, and reads it all back", async () => {
    const userId = await createGuest();
    guests.push(userId);

    const conv = await conversations.create(userId);
    const appended = await messages.append(userId, conv.id, [
      { id: newId(), role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: newId(),
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);
    expect(appended).toEqual({ ok: true, value: 2 });

    const started = await runs.start(userId, conv.id, "stellar", "1");
    if (!started.ok) throw new Error("start failed");
    const runId = started.value.run.id;
    expect(started.value.run.status).toBe("in_progress");
    // Spec 0004: a report is only claimed for a run whose credits are held.
    await fundRun(userId, runId);

    const saved = await runs.saveAnswer(
      userId,
      runId,
      "q1",
      { v: 1 },
      "client",
    );
    expect(saved.ok).toBe(true);

    const snapshot = await runs.get(userId, runId);
    if (!snapshot.ok) throw new Error("get failed");
    const lastAnswerAt = snapshot.value.answers
      .map((a) => a.updatedAt)
      .sort()
      .at(-1);
    const done = await runs.complete(
      userId,
      runId,
      { total: 42 },
      snapshot.value.answers.length,
      lastAnswerAt ?? null,
    );
    expect(done.ok && done.value.status).toBe("completed");

    const claimed = await reports.claim(userId, runId);
    if (!claimed.ok) throw new Error("claim failed");
    expect(claimed.value.attempts).toBe(1);
    const ready = await reports.markReady(
      runId,
      1,
      { summary: "ok" },
      "model-x",
    );
    expect(ready.ok && ready.value.status).toBe("ready");

    // A fresh request reads it all back (AC-1, AC-10).
    const opened = await conversations.open(userId, conv.id);
    if (!opened.ok) throw new Error("open failed");
    expect(opened.value.messages).toHaveLength(2);
    expect(opened.value.messages[0]?.role).toBe("user");
    expect(opened.value.runs).toHaveLength(1);
    expect(opened.value.runs[0]?.run.scores).toEqual({ total: 42 });
    expect(opened.value.runs[0]?.report?.status).toBe("ready");

    // Another user gets not_found, never the data (AC-8).
    const other = await createGuest();
    guests.push(other);
    const denied = await conversations.open(other, conv.id);
    expect(denied).toEqual({ ok: false, error: { code: "not_found" } });
  });
});
