/**
 * Paystack sends the client back here after the hosted checkout (spec 0004, AC-8, AC-13).
 * The payment is verified on the server (never trusting the query string), granted once
 * if it succeeded, and the client goes back to the chat they bought from (only when it is
 * theirs) or to `/credits`, with the outcome for the status message. With no session
 * (it expired mid checkout) the client lands on `/credits`, which asks them to sign in;
 * the webhook still grants the payment.
 */
import type { NextRequest } from "next/server";
import { sessionUserId } from "@/auth/session";
import {
  callbackDestination,
  handleCallback,
  isUuid,
} from "@/billing/checkout";
import * as conversations from "@/db/queries/conversations";
import * as payments from "@/db/queries/payments";
import { settleDeps, verify } from "../payment-deps";

const redirectTo = (request: NextRequest, path: string): Response =>
  new Response(null, {
    status: 303,
    headers: {
      Location: new URL(path, request.nextUrl.origin).toString(),
      "Cache-Control": "no-store",
    },
  });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const userId = await sessionUserId(request.headers);
  if (userId === null) return redirectTo(request, "/credits?payment=pending");
  const returnTo = params.get("returnTo");
  const [outcome, owner] = await Promise.all([
    handleCallback(
      { ...settleDeps, forUser: payments.forUser, verify },
      userId,
      params.get("reference"),
    ),
    isUuid(returnTo) ? conversations.ownerOf(returnTo) : null,
  ]);
  const ownChat = owner !== null && owner.ok && owner.value === userId;
  return redirectTo(
    request,
    callbackDestination(outcome, ownChat ? returnTo : null),
  );
}
