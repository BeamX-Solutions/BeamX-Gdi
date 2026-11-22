import type { BillingConfig, Pack } from "./config";

/** Pure billing math (spec 0004). No I/O; config is passed in. */

export type AccountNumbers = {
  readonly balance: number;
  readonly held: number;
};

export const available = (a: AccountNumbers | null): number =>
  a ? a.balance - a.held : 0;

export const shortfall = (price: number, availableCredits: number): number =>
  Math.max(0, price - availableCredits);

/** Packs that cover the shortfall, cheapest first; the largest pack when none covers it. */
export const coveringPacks = (
  packs: readonly Pack[],
  missing: number,
): readonly Pack[] => {
  const covering = [...packs]
    .filter((p) => p.credits >= missing)
    .sort((a, b) => a.priceNgn - b.priceNgn);
  if (covering.length > 0) return covering;
  const largest = packs.reduce<Pack | null>(
    (m, p) => (m === null || p.credits > m.credits ? p : m),
    null,
  );
  return largest ? [largest] : [];
};

/** The price on the approved card must equal the current server price (AC-2). */
export const priceStillValid = (shownPrice: number, currentPrice: number) =>
  shownPrice === currentPrice;

/**
 * Credits for a paid chat turn: real AI cost in naira times the markup, rounded up to
 * whole credits, at least 1, never above the ceiling (AC-10).
 */
export const chatCharge = (
  costUsd: number,
  cfg: Pick<BillingConfig, "ngnPerCredit" | "chat">,
): number => {
  const raw =
    (costUsd * cfg.chat.usdToNgn * cfg.chat.markup) / cfg.ngnPerCredit;
  // Small epsilon so float noise (1.0000000002) does not round up a whole credit.
  const credits = Math.ceil(raw - 1e-9);
  return Math.min(cfg.chat.ceilingCredits, Math.max(1, credits));
};

/**
 * A disconnect while resumable streams are off (spec 0004, AC-10): nothing before the
 * first output; otherwise the real cost, or 1 if unknown. The name predates the decision
 * that there is no chat Stop button.
 */
export const chatChargeOnStop = (
  costUsd: number | null,
  receivedOutput: boolean,
  cfg: Pick<BillingConfig, "ngnPerCredit" | "chat">,
): number => {
  if (!receivedOutput) return 0;
  return costUsd === null ? 1 : chatCharge(costUsd, cfg);
};

/** `YYYY-MM-DD` of `at` in `timeZone` (the allowance day and expiry dates use Lagos). */
export const localDate = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

const parseDate = (d: string): { y: number; m: number; day: number } => {
  const [y, m, day] = d.split("-").map(Number);
  if (y === undefined || m === undefined || day === undefined)
    throw new Error(`bad date ${d}`);
  return { y, m, day };
};

const fmt = (y: number, m: number, day: number): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Calendar month arithmetic, clamping the day (31 Jan + 1 month = 28 or 29 Feb). */
export const addMonths = (date: string, months: number): string => {
  const { y, m, day } = parseDate(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return fmt(ny, nm, Math.min(day, daysInMonth(ny, nm)));
};

export const addDays = (date: string, days: number): string => {
  const { y, m, day } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, day + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

/** The Lagos date the balance expires on: last activity + 12 calendar months (AC-15). */
export const expiryDate = (
  lastActivityAt: Date,
  cfg: Pick<BillingConfig, "expiry" | "chat">,
): string =>
  addMonths(
    localDate(lastActivityAt, cfg.chat.dayTimeZone),
    cfg.expiry.inactiveMonths,
  );

export type ExpiryState = "ok" | "warn" | "expired";

export const expiryState = (
  lastActivityAt: Date,
  balance: number,
  now: Date,
  cfg: Pick<BillingConfig, "expiry" | "chat">,
): ExpiryState => {
  if (balance <= 0) return "ok";
  const today = localDate(now, cfg.chat.dayTimeZone);
  const expires = expiryDate(lastActivityAt, cfg);
  if (today >= expires) return "expired";
  if (today >= addDays(expires, -cfg.expiry.warnDays)) return "warn";
  return "ok";
};
