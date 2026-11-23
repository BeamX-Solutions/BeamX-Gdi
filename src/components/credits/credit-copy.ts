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
