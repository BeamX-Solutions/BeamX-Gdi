/**
 * Server only. Policy acceptances (spec 0017, AC-5, AC-6): which version of the terms and
 * the privacy notice each account accepted. Recording is idempotent (the unique index on
 * user, policy and version), so the sign up hook and the updated terms card can both run
 * more than once.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { PolicyKind } from "@/legal/config";
import { db } from "../client";
import { policyAcceptance } from "../schema";

export type Acceptance = {
  readonly policy: PolicyKind;
  readonly version: string;
};

/** Records each acceptance once; a version already recorded is left alone. */
export const record = async (
  userId: string,
  accepted: readonly Acceptance[],
): Promise<void> => {
  if (accepted.length === 0) return;
  await db
    .insert(policyAcceptance)
    .values(accepted.map((a) => ({ userId, ...a })))
    .onConflictDoNothing();
};

/** The version of `policy` the user accepted most recently, or null for none. */
export const newestVersion = async (
  userId: string,
  policy: PolicyKind,
): Promise<string | null> => {
  const [row] = await db
    .select({ version: policyAcceptance.version })
    .from(policyAcceptance)
    .where(
      and(
        eq(policyAcceptance.userId, userId),
        eq(policyAcceptance.policy, policy),
      ),
    )
    .orderBy(desc(policyAcceptance.acceptedAt))
    .limit(1);
  return row?.version ?? null;
};

/**
 * The guest link step (`users.linkGuest`). A guest never accepts a policy, so this
 * normally moves nothing; a row the account already holds for the same version stays
 * behind and goes with the guest, so the unique index can never abort the link.
 */
export const linkGuestPolicyStatement = (
  guestUserId: string,
  newUserId: string,
) =>
  db.execute(sql`
    UPDATE policy_acceptance AS g SET user_id = ${newUserId}::uuid
    WHERE g.user_id = ${guestUserId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM policy_acceptance AS a
        WHERE a.user_id = ${newUserId}::uuid
          AND a.policy = g.policy AND a.version = g.version
      )`);
