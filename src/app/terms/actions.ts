"use server";

/**
 * The updated terms card's OK (spec 0017, AC-6): records that the signed in account
 * accepted the current version of both policies, as the card says. Guests have nothing to accept (the composer notice
 * covers them) and get `not_signed_in`. Idempotent.
 */
import { headers } from "next/headers";
import { sessionUser } from "@/auth/session";
import * as policies from "@/db/queries/policies";
import { currentAcceptances, LEGAL } from "@/legal/config";
import { logEvent } from "@/lib/log";
import { err, ok, type Result } from "@/lib/result";

export async function acceptTermsAction(): Promise<
  Result<null, { readonly code: "not_signed_in" }>
> {
  const user = await sessionUser(await headers());
  if (user === null || user.isAnonymous) return err({ code: "not_signed_in" });
  await policies.record(user.id, currentAcceptances());
  logEvent("policies_accepted", {
    userId: user.id,
    terms: LEGAL.termsVersion,
    privacy: LEGAL.privacyVersion,
  });
  return ok(null);
}
