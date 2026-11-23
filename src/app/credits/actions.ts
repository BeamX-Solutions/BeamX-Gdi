"use server";

/**
 * The checkout Server Action (spec 0004, AC-8, AC-13): a signed in account picks a pack
 * (from the short balance card or `/credits`) and gets the Paystack page to go to.
 * Guests get `not_signed_in`; prices come only from `billingConfig`.
 */
import { headers } from "next/headers";
import { z } from "zod";
import { claimGrants } from "@/auth/grants";
import { sessionAccount } from "@/auth/session";
import {
  CHECKOUT_RATE,
  startCheckout,
  type CheckoutError,
} from "@/billing/checkout";
import { billingConfig } from "@/billing/config";
import * as paystack from "@/billing/paystack";
import * as payments from "@/db/queries/payments";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { err, type Result } from "@/lib/result";
import { allowCheckout, paystackDeps } from "./payment-deps";

const inputSchema = z.object({
  packId: z.string().min(1).max(32),
  returnTo: z.string().max(64).nullable(),
});

export async function startCheckoutAction(
  packId: string,
  returnTo: string | null,
): Promise<Result<{ readonly authorizationUrl: string }, CheckoutError>> {
  const input = inputSchema.safeParse({ packId, returnTo });
  if (!input.success) return err({ code: "unknown_pack" });
  return startCheckout(
    {
      user: await sessionAccount(await headers()),
      packs: billingConfig.packs,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      allow: (userId) => allowCheckout(userId, CHECKOUT_RATE),
      openAccount: claimGrants,
      createPayment: payments.create,
      initialize: (i) => paystack.initialize(paystackDeps, i),
      log: logEvent,
    },
    input.data,
  );
}
