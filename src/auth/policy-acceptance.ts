/**
 * Records the policies an account accepted by signing up (spec 0017, AC-5). Better Auth's
 * user create hook calls it; the account is created by the email code sign in, so this
 * runs in the same flow that verifies the email. Create only: an update (a name or
 * password change) must never accept a newer version the user hasn't seen.
 *
 * A failure is logged and swallowed, never blocking sign up. The account then has no
 * terms row, so the updated terms card asks once (AC-6), which records it.
 */
import type { Acceptance } from "@/db/queries/policies";
import { LEGAL } from "@/legal/config";
import { logEvent } from "@/lib/log";
import { isVerifiedAccount, type UserWrite } from "./account-verified";

/** What signing up accepts: the current version of both policies. Pure. */
export const signUpAcceptances = (): readonly Acceptance[] => [
  { policy: "terms", version: LEGAL.termsVersion },
  { policy: "privacy", version: LEGAL.privacyVersion },
];

type Record = (
  userId: string,
  accepted: readonly Acceptance[],
) => Promise<void>;

export const afterAccountCreated =
  (record: Record, log: typeof logEvent = logEvent) =>
  async (user: UserWrite): Promise<void> => {
    if (!isVerifiedAccount(user)) return;
    try {
      await record(user.id, signUpAcceptances());
      log("policies_accepted", {
        userId: user.id,
        terms: LEGAL.termsVersion,
        privacy: LEGAL.privacyVersion,
      });
    } catch {
      log("policy_record_failed", { userId: user.id });
    }
  };
