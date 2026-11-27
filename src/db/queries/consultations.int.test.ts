/**
 * Spec 0016, AC-2, AC-5, AC-7, AC-8: one open call per chat, owner only reads, and
 * booking and canceling move once (a retried webhook changes nothing).
 */
import { afterAll, describe, expect, it } from "vitest";
import * as consultations from "./consultations";
import * as conversations from "./conversations";
import { linkGuest } from "./users";
import { guestTracker, unwrap } from "../test/helpers";

const t = guestTracker();
afterAll(() => t.cleanup());

const booking = (n: string) => ({
  startTime: "2026-12-02T09:00:00.000000Z",
  eventUri: `https://api.calendly.com/scheduled_events/${n}`,
  inviteeUri: `https://api.calendly.com/scheduled_events/${n}/invitees/${n}`,
});

describe("consultations", () => {
  it("offers once per chat and reuses the open offer", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const first = unwrap(await consultations.offer(u, conv.id));
    const again = unwrap(await consultations.offer(u, conv.id));
    expect(first.status).toBe("offered");
    expect(again.id).toBe(first.id);
  });

  it("is not_found for another user's chat, and get is owner only", async () => {
    const [a, b] = [await t.guest(), await t.guest()];
    const conv = await conversations.create(a);
    expect(await consultations.offer(b, conv.id)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    const offer = unwrap(await consultations.offer(a, conv.id));
    expect(await consultations.get(b, offer.id)).toBeNull();
    expect((await consultations.get(a, offer.id))?.id).toBe(offer.id);
  });

  it("books once, then cancels once, and a canceled chat gets a new offer", async () => {
    const u = await t.guest();
    const conv = await conversations.create(u);
    const offer = unwrap(await consultations.offer(u, conv.id));
    const b = booking(offer.id);

    const booked = await consultations.book(offer.id, b);
    expect(booked).toMatchObject({ id: offer.id, conversationId: conv.id });
    // Calendly retries the webhook: nothing moves the second time.
    expect(await consultations.book(offer.id, b)).toBeNull();
    // The open call is the booked one, not a new offer.
    expect(unwrap(await consultations.offer(u, conv.id))).toMatchObject({
      id: offer.id,
      status: "booked",
    });

    expect((await consultations.cancel(b.inviteeUri))?.id).toBe(offer.id);
    expect(await consultations.cancel(b.inviteeUri)).toBeNull();
    const next = unwrap(await consultations.offer(u, conv.id));
    expect(next.id).not.toBe(offer.id);
    expect(next.status).toBe("offered");
  });

  it("ignores a booking for an unknown id", async () => {
    expect(
      await consultations.book(
        "00000000-0000-4000-8000-000000000000",
        booking("unknown"),
      ),
    ).toBeNull();
  });

  it("follows the guest to the account on link", async () => {
    const [guest, account] = [await t.guest(), await t.guest()];
    const conv = await conversations.create(guest);
    const offer = unwrap(await consultations.offer(guest, conv.id));
    await linkGuest(guest, account);
    expect((await consultations.get(account, offer.id))?.id).toBe(offer.id);
  });
});
