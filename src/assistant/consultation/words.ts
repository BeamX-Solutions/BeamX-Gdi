/** What the chat says when a strategy call is booked or canceled (spec 0016, AC-5, AC-7). Pure. */
import { callTime } from "@/lib/call-time";

export { callTime, dateOf } from "@/lib/call-time";

export const consultationWords = {
  booked: (at: Date | null) =>
    at === null
      ? "You're booked for a free strategy call. Calendly has emailed you the details."
      : `You're booked for a free strategy call on ${callTime(at)}. Calendly has emailed you the details.`,
  canceled: "Your strategy call was canceled. Ask me any time to book another.",
} as const;
