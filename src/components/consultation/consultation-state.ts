/**
 * The strategy call card's state and words (spec 0016, AC-3, AC-8). The tool result is
 * the starting point; the card's own poll and the widget's `event_scheduled` move it on.
 * Pure.
 */
import { callTime, dateOf } from "@/lib/call-time";

export type ConsultationStatus = "offered" | "booked" | "canceled";

export type LiveConsultation = {
  readonly status: ConsultationStatus;
  readonly startTime: string | null;
};

export type CardView =
  | { readonly kind: "offered" }
  /** The widget says booked; the webhook hasn't confirmed yet. */
  | { readonly kind: "waiting" }
  | { readonly kind: "booked"; readonly when: string | null }
  | { readonly kind: "canceled" };

export const consultationCopy = {
  title: "Book a free strategy call",
  text: "Talk through your results with a BeamX adviser for 30 minutes, free. Pick a time that suits you.",
  button: "Book a time",
  dialogTitle: "Pick a time for your strategy call",
  dialogText:
    "Your name and email are filled in for you when you are signed in.",
  waiting: "Booked. Calendly has emailed you the details.",
  booked: (when: string | null) =>
    when === null ? "Your strategy call is booked." : `Booked for ${when}.`,
  canceled: "This call was canceled. Ask me any time to book another.",
} as const;

/** What the card shows, from the newest of the poll and the tool result. */
export const cardView = (
  live: LiveConsultation,
  scheduled: boolean,
): CardView => {
  switch (live.status) {
    case "booked": {
      const at = dateOf(live.startTime);
      return { kind: "booked", when: at === null ? null : callTime(at) };
    }
    case "canceled":
      return { kind: "canceled" };
    case "offered":
      return scheduled ? { kind: "waiting" } : { kind: "offered" };
    default: {
      const unreachable: never = live.status;
      return unreachable;
    }
  }
};

/** How long the card polls after the widget says booked (AC-8). */
export const POLL_MS = 3_000;
export const POLL_FOR_MS = 60_000;

/**
 * The Calendly link with the prefill and our id (AC-3). Calendly reads `name`, `email`
 * and `utm_content` from the query; `hide_gdpr_banner` keeps the dialog short.
 */
export const calendlyEmbedUrl = (
  base: string,
  consultationId: string,
  prefill: { readonly name: string | null; readonly email: string | null },
): string => {
  const url = new URL(base);
  url.searchParams.set("embed_type", "Inline");
  url.searchParams.set("hide_gdpr_banner", "1");
  url.searchParams.set("utm_content", consultationId);
  if (prefill.name) url.searchParams.set("name", prefill.name);
  if (prefill.email) url.searchParams.set("email", prefill.email);
  return url.toString();
};

/** True for Calendly's "booked" message from its embed (AC-3). */
export const isScheduledMessage = (origin: string, data: unknown): boolean =>
  origin === "https://calendly.com" &&
  typeof data === "object" &&
  data !== null &&
  "event" in data &&
  data.event === "calendly.event_scheduled";
