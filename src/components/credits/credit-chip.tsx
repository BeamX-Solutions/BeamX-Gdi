"use client";

import { CoinsIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useContext } from "react";
import type { CreditSummary } from "@/billing/summary";
import { EXPIRY_SOON, chipText } from "./credit-copy";

/**
 * The newest summary the chat has seen this visit (an approval, a stop, a report poll),
 * or null before any. The chat provides it; the chip prefers it over its server seed.
 */
export const LiveCreditSummary = createContext<CreditSummary | null>(null);

/**
 * The header credit chip (spec 0007, AC-9): "N credits" available. Seeded by the
 * header's server read of `credits.getSummary`, then updated from the chat. It links to
 * `/credits` (balance, packs, history; spec 0004, AC-14). Hidden
 * while the user has no credit account. `expiring` adds a warning dot from 30 days before
 * the balance expires (spec 0004, AC-15), worked out on the server.
 */
export function CreditChip({
  initial,
  expiring = false,
}: {
  readonly initial: CreditSummary | null;
  readonly expiring?: boolean;
}) {
  const live = useContext(LiveCreditSummary);
  const summary = live ?? initial;
  if (summary === null) return null;
  // The pill stays 36px tall; the link around it is the 44px tap target.
  return (
    <Link
      href="/credits"
      className="group inline-flex min-h-11 shrink-0 items-center rounded-full focus-visible:outline-none"
    >
      <span
        data-testid="credit-chip"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium group-hover:bg-accent group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50"
      >
        <CoinsIcon className="size-4 text-primary" aria-hidden />
        <span>
          <span className="sr-only">Available: </span>
          {chipText(summary.available)}
        </span>
        {expiring ? (
          <span
            data-testid="credit-chip-expiry"
            className="size-2 rounded-full bg-destructive"
            role="img"
            aria-label={EXPIRY_SOON}
            title={EXPIRY_SOON}
          />
        ) : null}
      </span>
    </Link>
  );
}
