import Link from "next/link";
import { ledgerLabel, signedAmount, type LedgerKind } from "@/billing/history";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { credits, formatEntryTime } from "./credit-copy";

export type HistoryEntry = {
  readonly id: string;
  readonly kind: LedgerKind;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly createdAt: string;
};

/**
 * The credit history on `/credits` (spec 0004, AC-14): newest first, 20 a page. Each line
 * says what happened, when (Lagos time), the signed amount and the balance after it.
 * `olderHref` links the next page; `newestHref` goes back to the first.
 */
export function CreditHistory({
  entries,
  timeZone,
  olderHref,
  newestHref,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly timeZone: string;
  readonly olderHref: string | null;
  readonly newestHref: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No credit activity yet. Starter credits, purchases and tool runs show
          up here.
        </p>
      ) : (
        <ul data-testid="credit-history" className="flex flex-col divide-y">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex min-w-0 items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium wrap-anywhere">
                  {ledgerLabel(e.kind)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatEntryTime(e.createdAt, timeZone)}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    e.amount > 0 ? "text-primary" : "text-foreground",
                  )}
                >
                  {signedAmount(e.amount)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  <span className="sr-only">Balance after: </span>
                  {credits(e.balanceAfter)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {olderHref !== null || newestHref !== null ? (
        <nav aria-label="History pages" className="flex flex-wrap gap-2">
          {newestHref !== null ? (
            <Button asChild variant="outline">
              <Link href={newestHref}>Newest</Link>
            </Button>
          ) : null}
          {olderHref !== null ? (
            <Button asChild variant="outline">
              <Link href={olderHref}>Older</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
