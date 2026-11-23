"use client";

import { useCallback, useState } from "react";
import type { Result } from "@/lib/result";

export type CheckoutErrorCode =
  "not_signed_in" | "unknown_pack" | "rate_limited" | "paystack_unavailable";

/**
 * Starts a checkout (spec 0004, AC-8, AC-13). The route passes in its Server Action, so
 * components never import from `src/app`. Returns the Paystack page, or why not.
 */
export type BuyCredits = (
  packId: string,
  returnTo: string | null,
) => Promise<
  Result<
    { readonly authorizationUrl: string },
    { readonly code: CheckoutErrorCode }
  >
>;

/**
 * The Buy buttons' state: which pack is opening, and the last failure. On success the
 * browser goes to Paystack (the pack stays "opening" until the page leaves). A thrown
 * action (network down) counts as Paystack unavailable, never a blank screen (AC-21).
 */
export const useBuy = (buy: BuyCredits, returnTo: string | null) => {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<CheckoutErrorCode | null>(null);
  const start = useCallback(
    async (packId: string) => {
      setPending(packId);
      setError(null);
      try {
        const result = await buy(packId, returnTo);
        if (result.ok) {
          window.location.assign(result.value.authorizationUrl);
          return;
        }
        setError(result.error.code);
      } catch {
        setError("paystack_unavailable");
      }
      setPending(null);
    },
    [buy, returnTo],
  );
  return { pending, error, start };
};
