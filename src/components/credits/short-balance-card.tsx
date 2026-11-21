import { WalletIcon } from "lucide-react";
import { useId } from "react";
import type { Pack } from "@/billing/config";
import {
  guestShortLine,
  packLine,
  shortfallLine,
  shortTitle,
} from "./credit-copy";

type ShortBalanceCardProps = {
  readonly shortfall: number;
  /** Guests see the account line; accounts see the packs that cover the shortfall. */
  readonly guest: boolean;
  /** `coveringPacks(billingConfig.packs, shortfall)`, for accounts. */
  readonly packs: readonly Pack[];
};

/**
 * The short balance card (spec 0004 AC-8, spec 0007 AC-10): how many credits are
 * missing. In #7 a guest is told an account will offer more, with no button until #8;
 * an account sees the packs, with buying from #22's checkout milestone.
 */
export function ShortBalanceCard({
  shortfall,
  guest,
  packs,
}: ShortBalanceCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <WalletIcon
          className="mt-0.5 size-5 shrink-0 text-primary"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="font-heading font-semibold wrap-anywhere">
            {shortTitle}
          </p>
          <p className="text-sm wrap-anywhere">{shortfallLine(shortfall)}</p>
        </div>
      </div>
      {guest ? (
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {guestShortLine}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {packs.map((pack) => (
            <li key={pack.id}>{packLine(pack)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
