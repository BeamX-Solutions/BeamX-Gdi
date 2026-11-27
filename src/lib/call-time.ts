/** A strategy call's time in words, in Lagos (spec 0016). Pure. */
import { billingConfig } from "@/billing/config";

const zone = billingConfig.chat.dayTimeZone;

/** A stored or ISO timestamp as a Date, or null. */
export const dateOf = (stored: string | null): Date | null => {
  if (stored === null) return null;
  const at = new Date(
    stored
      .trim()
      .replace(" ", "T")
      .replace(/(\.\d{3})\d+/, "$1")
      .replace(/([+-]\d{2})$/, "$1:00"),
  );
  return Number.isNaN(at.getTime()) ? null : at;
};

/** "Wed 2 Dec at 10:00 (Lagos time)". */
export const callTime = (at: Date): string => {
  const day = at.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: zone,
  });
  const time = at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone,
  });
  return `${day.replace(",", "")} at ${time} (Lagos time)`;
};
