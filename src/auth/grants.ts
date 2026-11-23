/**
 * Server only. The live account grants (spec 0004, AC-11, AC-16): opens the credit account
 * with its starter grant if needed, then claims the sign up grant and any Luna import for
 * a verified account. Called from the verified account hook (`account-verified.ts`) and at
 * a signed in user's billable actions (`assistant/billing-deps.ts`), so a failed hook heals
 * itself at the next one. Idempotent.
 */
import { billingConfig } from "@/billing/config";
import { signupEmailHash } from "@/billing/money-ops";
import * as credits from "@/db/queries/credits";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";

const hashEmail = (email: string): string | null => {
  const secret = env.BILLING_HASH_SECRET;
  if (secret === undefined) {
    logEvent("signup_grant_skipped", { reason: "no_hash_secret" });
    return null;
  }
  return signupEmailHash(email, secret);
};

export const claimGrants = async (
  userId: string,
): Promise<credits.ClaimedGrants> => {
  const claimed = await credits.claimPendingGrants(userId, {
    starter: billingConfig.grants.starter,
    signup: billingConfig.grants.signup,
    hashEmail,
  });
  if (claimed.starter > 0 || claimed.signup > 0 || claimed.luna > 0)
    logEvent("grants_claimed", {
      userId,
      starter: claimed.starter,
      signup: claimed.signup,
      luna: claimed.luna,
    });
  return claimed;
};
