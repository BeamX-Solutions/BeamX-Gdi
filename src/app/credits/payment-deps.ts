/**
 * Server only. The live dependencies of the buying flows in `billing/checkout.ts` (spec
 * 0004, AC-13), shared by the checkout Server Action, the callback, the webhook and the
 * daily payment sweep, so each edge stays a few lines of wiring.
 */
import { authRateLimiter } from "@/auth/rate-limit";
import type { SettleDeps, VerifyFn } from "@/billing/checkout";
import * as paystack from "@/billing/paystack";
import * as payments from "@/db/queries/payments";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";

export const paystackDeps: paystack.PaystackDeps = {
  secretKey: env.PAYSTACK_SECRET_KEY,
  fetch: (input, init) => fetch(input, init),
};

export const verify: VerifyFn = (reference) =>
  paystack.verify(paystackDeps, reference);

export const settleDeps: SettleDeps = {
  markSucceeded: payments.markSucceeded,
  markFailed: payments.markFailed,
  log: logEvent,
};

/** 10 checkouts a user an hour; fails open like every other limit. */
export const allowCheckout = async (
  userId: string,
  rule: { readonly window: number; readonly max: number },
): Promise<boolean> =>
  (await authRateLimiter.consumeKey(`billing:checkout:${userId}`, rule))
    .allowed;
