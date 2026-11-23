/**
 * The verified account seam (spec 0009, AC-16). Better Auth's user create and update hooks
 * call `afterUserWrite` on every write; it calls `onAccountVerified` only for a non guest
 * user with a verified email. That can happen many times for one user (every name or
 * password change is an update), so whatever plugs in here must be idempotent.
 *
 * It claims the account grants (spec 0004, AC-11, AC-16: starter, sign up, Luna), which
 * are idempotent. A failure is logged as `grant_claim_failed` and swallowed: it never
 * blocks sign up or sign in, and the next billable action claims again.
 */
import { claimGrants } from "./grants";
import { logEvent } from "@/lib/log";

export type UserWrite = {
  readonly id: string;
  readonly emailVerified: boolean;
  readonly isAnonymous?: boolean | null | undefined;
};

/** True for a user the hook applies to. Pure. */
export const isVerifiedAccount = (user: UserWrite): boolean =>
  user.emailVerified && user.isAnonymous !== true;

export const onAccountVerified = async (userId: string): Promise<void> => {
  logEvent("account_verified", { userId });
  try {
    await claimGrants(userId);
  } catch (e) {
    logEvent("grant_claim_failed", {
      userId,
      error: e instanceof Error ? e.name : "unknown",
    });
  }
};

type Log = typeof logEvent;

export const afterUserWrite =
  (
    verified: (userId: string) => Promise<void> = onAccountVerified,
    log: Log = logEvent,
  ) =>
  async (user: UserWrite): Promise<void> => {
    if (!isVerifiedAccount(user)) return;
    try {
      await verified(user.id);
    } catch {
      log("account_verified_failed", { userId: user.id });
    }
  };
