/**
 * The Paystack webhook (spec 0004, AC-13). Nothing is trusted until the HMAC SHA512 of
 * the raw body matches `x-paystack-signature` (401 otherwise); then `charge.success` for
 * one of our payments grants it once, checked against our own amount and currency. Other
 * events answer 200. A DB outage throws and answers 500, so Paystack retries.
 */
import { handleWebhook } from "@/billing/checkout";
import { parseWebhook, validSignature } from "@/billing/paystack";
import * as payments from "@/db/queries/payments";
import { env } from "@/lib/env";
import { settleDeps } from "@/app/credits/payment-deps";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleWebhook(
    {
      ...settleDeps,
      validSignature: (raw, signature) =>
        validSignature(raw, signature, env.PAYSTACK_SECRET_KEY),
      parse: parseWebhook,
      byId: payments.byId,
    },
    rawBody,
    request.headers.get("x-paystack-signature"),
  );
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
