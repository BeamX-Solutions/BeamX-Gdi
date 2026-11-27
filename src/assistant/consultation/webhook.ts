/**
 * Server only. The Calendly webhook (spec 0016, AC-4 to AC-7, AC-9) with every effect
 * passed in. Nothing is trusted until the signature matches. Only the call that moves a
 * consultation (booked, or canceled) writes to the chat and emails BeamX, so Calendly's
 * retries are harmless. A follow up that fails is logged and the webhook still answers
 * 200: the booking is recorded, and a retry would not redo it anyway.
 */
import type { logEvent } from "@/lib/log";
import { calendlyWebhookSchema, consultationIdOf } from "./payload";
import { validSignature } from "./signature";
import { consultationWords, dateOf } from "./words";

export type Moved = {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly startTime: string | null;
};

export type BookingNotice = {
  readonly kind: "booked" | "canceled";
  readonly consultationId: string;
  readonly userId: string;
  readonly conversationId: string;
  /** From Calendly's payload; only ever sent to BeamX, never logged. */
  readonly clientName: string | null;
  readonly clientEmail: string | null;
  readonly startTime: Date | null;
};

export type WebhookDeps = {
  readonly signingKey: string | undefined;
  readonly nowS: () => number;
  readonly book: (
    id: string,
    booking: {
      readonly startTime: string;
      readonly eventUri: string;
      readonly inviteeUri: string;
    },
  ) => Promise<Moved | null>;
  readonly cancel: (inviteeUri: string) => Promise<Moved | null>;
  /** Appends one assistant message to the chat. */
  readonly say: (
    userId: string,
    conversationId: string,
    text: string,
  ) => Promise<void>;
  readonly notify: (notice: BookingNotice) => Promise<void>;
  readonly log: typeof logEvent;
};

export type WebhookReply = { readonly status: number; readonly body: unknown };

const reply = (status: number, body: unknown): WebhookReply => ({
  status,
  body,
});

/** Runs a follow up; a failure is logged, never thrown. */
const settle = async (
  deps: WebhookDeps,
  step: string,
  id: string,
  task: () => Promise<void>,
) => {
  try {
    await task();
  } catch {
    deps.log("consultation_follow_up_failed", { step, consultationId: id });
  }
};

export const handleCalendlyWebhook = async (
  deps: WebhookDeps,
  rawBody: string,
  signature: string | null,
): Promise<WebhookReply> => {
  if (deps.signingKey === undefined) {
    deps.log("calendly_webhook", { outcome: "not_configured" });
    return reply(503, { code: "not_configured" });
  }
  if (!validSignature(rawBody, signature, deps.signingKey, deps.nowS())) {
    deps.log("calendly_webhook", { outcome: "bad_signature" });
    return reply(401, { code: "bad_signature" });
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reply(400, { code: "invalid_body" });
  }
  const parsed = calendlyWebhookSchema.safeParse(json);
  if (!parsed.success) {
    deps.log("calendly_webhook", { outcome: "invalid_body" });
    return reply(400, { code: "invalid_body" });
  }
  const hook = parsed.data;
  const notice = (kind: BookingNotice["kind"], m: Moved): BookingNotice => ({
    kind,
    consultationId: m.id,
    userId: m.userId,
    conversationId: m.conversationId,
    clientName: hook.payload.name ?? null,
    clientEmail: hook.payload.email ?? null,
    startTime: dateOf(m.startTime),
  });

  switch (hook.event) {
    case "invitee.created": {
      const id = consultationIdOf(hook);
      const startTime = hook.payload.scheduled_event?.start_time;
      if (id === null || startTime === undefined) {
        deps.log("calendly_webhook", { event: hook.event, outcome: "ignored" });
        return reply(200, { received: true });
      }
      const m = await deps.book(id, {
        startTime,
        eventUri: hook.payload.event ?? "",
        inviteeUri: hook.payload.uri,
      });
      if (m === null) {
        deps.log("calendly_webhook", {
          event: hook.event,
          consultationId: id,
          outcome: "unchanged",
        });
        return reply(200, { received: true });
      }
      deps.log("consultation_booked", { consultationId: m.id });
      await Promise.all([
        settle(deps, "say", m.id, () =>
          deps.say(
            m.userId,
            m.conversationId,
            consultationWords.booked(dateOf(m.startTime)),
          ),
        ),
        settle(deps, "notify", m.id, () => deps.notify(notice("booked", m))),
      ]);
      return reply(200, { received: true });
    }
    case "invitee.canceled": {
      const m = await deps.cancel(hook.payload.uri);
      if (m === null) {
        deps.log("calendly_webhook", {
          event: hook.event,
          outcome: "unchanged",
        });
        return reply(200, { received: true });
      }
      deps.log("consultation_canceled", { consultationId: m.id });
      await Promise.all([
        settle(deps, "say", m.id, () =>
          deps.say(m.userId, m.conversationId, consultationWords.canceled),
        ),
        settle(deps, "notify", m.id, () => deps.notify(notice("canceled", m))),
      ]);
      return reply(200, { received: true });
    }
    default:
      return reply(200, { received: true });
  }
};
