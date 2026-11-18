import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../id";
import * as conversations from "./conversations";
import * as messages from "./messages";
import * as reports from "./reports";
import * as runs from "./runs";
import {
  completeFromAnswers,
  guestTracker,
  runWithAnswers,
  unwrap,
} from "../test/helpers";

const t = guestTracker();
afterAll(t.cleanup);

const notFound = { ok: false, error: { code: "not_found" } };

describe("cross user access returns not_found and changes nothing (AC-8)", () => {
  it("user B cannot touch user A's conversation, run, or report", async () => {
    const a = await t.guest();
    const b = await t.guest();
    const { conv, run } = await runWithAnswers(a);
    unwrap(await completeFromAnswers(a, run.id));
    const paused = unwrap(await runs.start(a, conv.id, "luna", "1"));

    expect(await conversations.get(b, conv.id)).toEqual(notFound);
    expect(await conversations.open(b, conv.id)).toEqual(notFound);
    expect(await conversations.remove(b, conv.id)).toEqual(notFound);
    expect(
      await messages.append(b, conv.id, [
        { id: newId(), role: "user", parts: [] },
      ]),
    ).toEqual(notFound);
    expect(await messages.listRecent(b, conv.id)).toEqual(notFound);
    expect(await runs.start(b, conv.id, "luna", "1")).toEqual(notFound);
    expect(await runs.get(b, run.id)).toEqual(notFound);
    expect(await runs.pause(b, paused.run.id)).toEqual(notFound);
    expect(await runs.resume(b, run.id)).toEqual(notFound);
    expect(await runs.abandon(b, run.id)).toEqual(notFound);
    expect(await runs.startFrom(b, run.id, "1")).toEqual(notFound);
    expect(await reports.claim(b, run.id)).toEqual(notFound);
    expect(await reports.listForConversation(b, conv.id)).toEqual(notFound);
    expect(await runs.getActive(b, conv.id)).toEqual({
      active: null,
      paused: [],
    });
    const list = unwrap(await conversations.list(b));
    expect(list.items).toHaveLength(0);

    // A's data is unchanged.
    const stillThere = unwrap(await runs.get(a, paused.run.id));
    expect(stillThere.run.status).toBe("in_progress");
    expect(unwrap(await runs.get(a, run.id)).report?.status).toBe("pending");
    expect(unwrap(await conversations.get(a, conv.id)).id).toBe(conv.id);
  });
});
