/**
 * Wording for the credit cards and the header chip (spec 0004 AC-8, spec 0006 AC-9,
 * spec 0007 Credit UI). Pure, so every string is tested in one place.
 */
import type { Pack } from "@/billing/config";

/** "1 credit", "30 credits". */
export const credits = (n: number): string =>
  `${n.toLocaleString("en-NG")} ${n === 1 ? "credit" : "credits"}`;

/** The money tools that show a confirm card with a price. */
export type ConfirmTool = "startRun" | "resumeRun" | "restartRun";

/** The confirm card's question, named after the tool when the card knows it. */
export const confirmTitle = (
  tool: ConfirmTool,
  toolName: string | null,
): string => {
  switch (tool) {
    case "startRun":
      return toolName ? `Start ${toolName}?` : "Start this check?";
    case "resumeRun":
      return toolName ? `Continue your ${toolName} run?` : "Continue your run?";
    case "restartRun":
      return "Start again with your answers?";
    default: {
      const unreachable: never = tool;
      return unreachable;
    }
  }
};

/** "This uses 30 credits." */
export const priceLine = (price: number): string =>
  `This uses ${credits(price)}.`;

/** "You have 30 credits available.", or null when the card has no balance. */
export const balanceLine = (available: number | null): string | null =>
  available === null ? null : `You have ${credits(available)} available.`;

/** Spec 0006, AC-9: the held amount is named only when there is one. */
export const stopTitle = (heldAmount: number): string =>
  heldAmount > 0
    ? `Stop this run? Your ${credits(heldAmount)} held will be returned.`
    : "Stop this run?";

export const shortTitle = "Not enough credits";

/** "You need 30 more credits for this run." */
export const shortfallLine = (shortfall: number): string =>
  `You need ${credits(shortfall)} more for this run.`;

/** Spec 0007, AC-10: until accounts (#8), a guest is told an account will offer more. */
export const guestShortLine =
  "Sign up for a free account to keep going. Your answers so far are kept.";

/** "100 credits for ₦10,000". */
export const packLine = (pack: Pack): string =>
  `${credits(pack.credits)} for ₦${pack.priceNgn.toLocaleString("en-NG")}`;

/** The header chip's text. */
export const chipText = (available: number): string => credits(available);

/** The chip's expiry warning dot, read out and shown on hover (spec 0004, AC-15). */
export const EXPIRY_SOON = "Your credits expire soon";

/** A pack's buy button: "Buy 100 credits for ₦10,000". */
export const buyLabel = (pack: Pack): string => `Buy ${packLine(pack)}`;

/** Shown on the pack's button while the Paystack page opens. */
export const BUY_PENDING = "Opening Paystack…";

/** Why a checkout could not start (spec 0004, AC-21): a friendly line, never an error page. */
export const checkoutErrorLine = (
  code:
    "not_signed_in" | "unknown_pack" | "rate_limited" | "paystack_unavailable",
): string => {
  switch (code) {
    case "not_signed_in":
      return "Sign in to your account to buy credits.";
    case "unknown_pack":
      return "That pack is no longer available. Pick another one.";
    case "rate_limited":
      return "You've started a lot of checkouts in the last hour. Try again a little later.";
    case "paystack_unavailable":
      return "Payments are unavailable right now. Try again in a few minutes. You were not charged.";
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
};

/** The toast after Paystack sends the client back to the chat (spec 0004, AC-8). */
export const paymentToast = (
  notice: "succeeded" | "pending" | "failed" | "not_found",
): string | null => {
  switch (notice) {
    case "succeeded":
      return "Payment received. Your credits are ready.";
    case "pending":
      // Also what a cancelled checkout returns as: Paystack keeps it open (`abandoned`,
      // `ongoing`), so the copy must fit someone who paid and someone who cancelled.
      return "We haven't received your payment yet. If you paid, your credits will appear shortly. If you cancelled, you weren't charged.";
    case "failed":
    case "not_found":
      return null;
    default: {
      const unreachable: never = notice;
      return unreachable;
    }
  }
};

/** The `/credits` status message after a checkout (spec 0004, AC-13, AC-21). */
export const paymentBanner = (
  notice: "succeeded" | "pending" | "failed" | "not_found",
): {
  readonly tone: "ok" | "error";
  readonly title: string;
  readonly message: string;
} => {
  switch (notice) {
    case "succeeded":
      return {
        tone: "ok",
        title: "Payment received",
        message: "Your credits are ready to use.",
      };
    case "pending":
      return {
        tone: "ok",
        title: "We haven't received your payment yet",
        message:
          "If you paid, your credits will appear here shortly, so you don't need to pay again. If you cancelled, you weren't charged.",
      };
    case "failed":
      return {
        tone: "error",
        title: "Payment didn't go through",
        message: "You were not charged. You can try again with any pack below.",
      };
    case "not_found":
      return {
        tone: "error",
        title: "We couldn't find that payment",
        message:
          "If you paid, your credits will appear here once Paystack confirms it.",
      };
    default: {
      const unreachable: never = notice;
      return unreachable;
    }
  }
};

/** The `/credits` expiry banner (spec 0004, AC-15), shown from 30 days before. */
export const expiryBannerTitle = "Your credits expire soon";
export const expiryBannerLine = (date: string, passed: boolean): string =>
  passed
    ? `Your balance reached its expiry date on ${date}. Buy credits or run a tool to keep it.`
    : `Your balance expires on ${date} unless you buy credits or run a tool before then.`;

/** "12 March 2027" from a calendar day (`YYYY-MM-DD`, already a Lagos date). */
export const formatDay = (day: string): string =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** A history line's time: "23 Nov 2026, 14:05", in Lagos time. */
export const formatEntryTime = (iso: string, timeZone: string): string =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
