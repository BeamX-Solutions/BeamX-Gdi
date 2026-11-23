"use client";

import { Loader2Icon } from "lucide-react";
import type { Pack } from "@/billing/config";
import { Button } from "@/components/ui/button";
import { useBuy, type BuyCredits } from "./buy";
import { BUY_PENDING, buyLabel, checkoutErrorLine } from "./credit-copy";

/**
 * One Buy button per pack (spec 0004, AC-8, AC-14), used by the short balance card and
 * `/credits`. Tapping one starts the Paystack checkout; while it opens, every button is
 * off. A failure shows one friendly line under the buttons (AC-21). `returnTo` is the
 * chat to land back in after paying.
 */
export function BuyPacks({
  packs,
  buy,
  returnTo,
}: {
  readonly packs: readonly Pack[];
  readonly buy: BuyCredits;
  readonly returnTo: string | null;
}) {
  const { pending, error, start } = useBuy(buy, returnTo);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {packs.map((pack) => (
          <li key={pack.id}>
            <Button
              variant="outline"
              className="w-full justify-start sm:w-auto"
              disabled={pending !== null}
              aria-busy={pending === pack.id}
              onClick={() => void start(pack.id)}
            >
              {pending === pack.id ? (
                <>
                  <Loader2Icon
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  {BUY_PENDING}
                </>
              ) : (
                buyLabel(pack)
              )}
            </Button>
          </li>
        ))}
      </ul>
      {error === null ? null : (
        <p className="text-sm wrap-anywhere text-destructive">
          {checkoutErrorLine(error)}
        </p>
      )}
    </div>
  );
}
