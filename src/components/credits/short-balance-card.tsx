import { WalletIcon } from "lucide-react";
import { useId } from "react";
import type { Pack } from "@/billing/config";
import { SIGN_UP_LABEL } from "@/components/auth/auth-copy";
import { Button } from "@/components/ui/button";
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
  /** Opens the auth dialog on sign up; a guest card shows the button only with it. */
  readonly onSignUp?: () => void;
};

/**
 * The short balance card (spec 0004 AC-8, spec 0007 AC-10): how many credits are
 * missing. A guest is told an account offers more, with a Sign up button (spec 0009,
 * AC-1); an account sees the packs, with buying from #22's checkout milestone.
 */
export function ShortBalanceCard({
  shortfall,
  guest,
  packs,
  onSignUp,
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
          <p id={titleId} className="font-semibold wrap-anywhere">
            {shortTitle}
          </p>
          <p className="text-sm wrap-anywhere">{shortfallLine(shortfall)}</p>
        </div>
      </div>
      {guest ? (
        <>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            {guestShortLine}
          </p>
          {onSignUp ? (
            <Button className="self-start" onClick={onSignUp}>
              {SIGN_UP_LABEL}
            </Button>
          ) : null}
        </>
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
