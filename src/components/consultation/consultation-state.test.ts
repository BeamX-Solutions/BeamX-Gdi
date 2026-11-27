import { describe, expect, it } from "vitest";
import {
  calendlyEmbedUrl,
  cardView,
  isScheduledMessage,
} from "./consultation-state";

// Spec 0016, AC-3, AC-8: the booking card.

describe("cardView", () => {
  it("offers, then waits once Calendly says booked", () => {
    const offered = { status: "offered" as const, startTime: null };
    expect(cardView(offered, false)).toEqual({ kind: "offered" });
    expect(cardView(offered, true)).toEqual({ kind: "waiting" });
  });

  it("shows the booked time in Lagos, and a cancel", () => {
    expect(
      cardView({ status: "booked", startTime: "2026-12-02 09:00:00+00" }, true),
    ).toEqual({ kind: "booked", when: "Wed 2 Dec at 10:00 (Lagos time)" });
    expect(cardView({ status: "canceled", startTime: null }, false)).toEqual({
      kind: "canceled",
    });
  });
});

describe("calendlyEmbedUrl", () => {
  it("carries our id and the prefill, and skips what is missing", () => {
    const url = new URL(
      calendlyEmbedUrl("https://calendly.com/beamxsolutions", "id-1", {
        name: "Ada Obi",
        email: "ada@gmail.com",
      }),
    );
    expect(url.searchParams.get("utm_content")).toBe("id-1");
    expect(url.searchParams.get("name")).toBe("Ada Obi");
    expect(url.searchParams.get("email")).toBe("ada@gmail.com");
    const guest = new URL(
      calendlyEmbedUrl("https://calendly.com/beamxsolutions", "id-1", {
        name: null,
        email: null,
      }),
    );
    expect(guest.searchParams.has("email")).toBe(false);
  });
});

describe("isScheduledMessage", () => {
  it("trusts only Calendly's origin and its booked event", () => {
    const booked = { event: "calendly.event_scheduled" };
    expect(isScheduledMessage("https://calendly.com", booked)).toBe(true);
    expect(isScheduledMessage("https://evil.example", booked)).toBe(false);
    expect(
      isScheduledMessage("https://calendly.com", {
        event: "calendly.date_and_time_selected",
      }),
    ).toBe(false);
  });
});
