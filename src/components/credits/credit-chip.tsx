"use client";

import { CoinsIcon } from "lucide-react";
import { createContext, useContext } from "react";
import type { CreditSummary } from "@/billing/summary";
import { chipText } from "./credit-copy";

/**
 * The newest summary the chat has seen this visit (an approval, a stop, a report poll),
 * or null before any. The chat provides it; the chip prefers it over its server seed.
 */
export const LiveCreditSummary = createContext<CreditSummary | null>(null);

/**
 * The header credit chip (spec 0007, AC-9): "N credits" available. Seeded by the
 * header's server read of `credits.getSummary`, then updated from the chat. Hidden
 * while the user has no credit account.
 */
export function CreditChip({
  initial,
}: {
  readonly initial: CreditSummary | null;
}) {
  const live = useContext(LiveCreditSummary);
  const summary = live ?? initial;
  if (summary === null) return null;
  return (
    <p
      data-testid="credit-chip"
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium"
    >
      <CoinsIcon className="size-4 text-primary" aria-hidden />
      <span>
        <span className="sr-only">Available: </span>
        {chipText(summary.available)}
      </span>
    </p>
  );
}
