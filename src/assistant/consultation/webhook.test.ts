import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { handleCalendlyWebhook } = await import("./webhook");
const { parseSignature, signPayload, validSignature, SIGNATURE_TOLERANCE_S } =
  await import("./signature");
const { callTime, consultationWords } = await import("./words");

type WebhookDeps = import("./webhook").WebhookDeps;

// Spec 0016, AC-4 to AC-7, AC-9.

const KEY = "test-signing-key";
const NOW = 1_796_000_000;
const ID = "00000000-0000-4000-8000-0000000000aa";
const INVITEE = "https://api.calendly.com/scheduled_events/E1/invitees/I1";

const signed = (body: unknown, t = NOW, key = KEY) => {
  const raw = JSON.stringify(body);
  return { raw, header: `t=${t},v1=${signPayload(key, t, raw)}` };
};

const created = (utm: string | null = ID) => ({
  event: "invitee.created",
  payload: {
    uri: INVITEE,
    name: "Ada Obi",
    email: "ada@gmail.com",
    event: "https://api.calendly.com/scheduled_events/E1",
    scheduled_event: { start_time: "2026-12-02T09:00:00.000000Z" },
    tracking: { utm_content: utm },
  },
});

const moved = {
  id: ID,
  userId: "u1",
  conversationId: "c1",
  startTime: "2026-12-02 09:00:00+00",
};

const deps = (over: Partial<WebhookDeps> = {}) => {
  const d = {
    signingKey: KEY,
    nowS: () => NOW,
    book: vi.fn<WebhookDeps["book"]>(async () => moved),
    cancel: vi.fn<WebhookDeps["cancel"]>(async () => moved),
    say: vi.fn<WebhookDeps["say"]>(async () => undefined),
    notify: vi.fn<WebhookDeps["notify"]>(async () => undefined),
    log: vi.fn(),
    ...over,
  };
  return d;
};

describe("signature (AC-4)", () => {
  it("parses t and v1", () => {
    expect(parseSignature("t=12,v1=abcd")).toEqual({ t: 12, v1: "abcd" });
    expect(parseSignature("v1=abcd")).toBeNull();
    expect(parseSignature(null)).toBeNull();
  });

  it("accepts the right key within 5 minutes only", () => {
    const { raw, header } = signed({ a: 1 });
    expect(validSignature(raw, header, KEY, NOW)).toBe(true);
    expect(validSignature(raw, header, "other", NOW)).toBe(false);
    expect(validSignature(`${raw} `, header, KEY, NOW)).toBe(false);
    expect(
      validSignature(raw, header, KEY, NOW + SIGNATURE_TOLERANCE_S + 1),
    ).toBe(false);
  });
});

describe("handleCalendlyWebhook", () => {
  it("is 503 without a key and 401 on a bad signature", async () => {
    const { raw, header } = signed(created());
    expect(
      (
        await handleCalendlyWebhook(
          deps({ signingKey: undefined }),
          raw,
          header,
        )
      ).status,
    ).toBe(503);
    const d = deps();
    expect((await handleCalendlyWebhook(d, raw, "t=1,v1=00")).status).toBe(401);
    expect(d.book).not.toHaveBeenCalled();
  });

  it("books, says so in the chat, and notifies BeamX once (AC-5, AC-6)", async () => {
    const d = deps();
    const { raw, header } = signed(created());
    expect(await handleCalendlyWebhook(d, raw, header)).toEqual({
      status: 200,
      body: { received: true },
    });
    expect(d.book).toHaveBeenCalledWith(ID, {
      startTime: "2026-12-02T09:00:00.000000Z",
      eventUri: "https://api.calendly.com/scheduled_events/E1",
      inviteeUri: INVITEE,
    });
    expect(d.say).toHaveBeenCalledWith(
      "u1",
      "c1",
      "You're booked for a free strategy call on Wed 2 Dec at 10:00 (Lagos time). Calendly has emailed you the details.",
    );
    expect(d.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "booked",
        clientName: "Ada Obi",
        clientEmail: "ada@gmail.com",
      }),
    );
    // Logs never carry the name or the email (AC-9).
    expect(JSON.stringify(vi.mocked(d.log).mock.calls)).not.toMatch(
      /Ada|gmail/,
    );
    expect(d.log).toHaveBeenCalledWith("consultation_booked", {
      consultationId: ID,
    });
  });

  it("does nothing more on a retry that moves nothing", async () => {
    const d = deps({ book: vi.fn(async () => null) });
    const { raw, header } = signed(created());
    expect((await handleCalendlyWebhook(d, raw, header)).status).toBe(200);
    expect(d.say).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("ignores bookings made outside the app (AC-4)", async () => {
    const d = deps();
    const { raw, header } = signed(created(null));
    expect((await handleCalendlyWebhook(d, raw, header)).status).toBe(200);
    expect(d.book).not.toHaveBeenCalled();
  });

  it("still answers 200 when a follow up fails", async () => {
    const d = deps({
      notify: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    const { raw, header } = signed(created());
    expect((await handleCalendlyWebhook(d, raw, header)).status).toBe(200);
    expect(d.say).toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith("consultation_follow_up_failed", {
      step: "notify",
      consultationId: ID,
    });
  });

  it("cancels once by invitee and says so (AC-7)", async () => {
    const d = deps();
    const { raw, header } = signed({
      event: "invitee.canceled",
      payload: { uri: INVITEE },
    });
    expect((await handleCalendlyWebhook(d, raw, header)).status).toBe(200);
    expect(d.cancel).toHaveBeenCalledWith(INVITEE);
    expect(d.say).toHaveBeenCalledWith("u1", "c1", consultationWords.canceled);
    expect(d.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "canceled" }),
    );
  });

  it("is 400 for a signed body that isn't a webhook", async () => {
    const { raw, header } = signed({ nope: true });
    expect((await handleCalendlyWebhook(deps(), raw, header)).status).toBe(400);
  });
});

describe("callTime", () => {
  it("says the day and time in Lagos", () => {
    expect(callTime(new Date("2026-12-02T09:00:00Z"))).toBe(
      "Wed 2 Dec at 10:00 (Lagos time)",
    );
  });
});
