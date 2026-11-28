import type { SessionUser } from "@/auth/session";
import { TermsUpdateCard } from "@/components/legal/terms-update-card";
import * as policies from "@/db/queries/policies";
import { termsOutdated } from "@/legal/config";
import { acceptTermsAction } from "./actions";

/**
 * True when this session should see the updated terms card (spec 0017, AC-6): a signed
 * in account whose newest accepted terms version is not the current one. Guests never.
 */
export const needsTermsCard = async (
  user: SessionUser | null,
): Promise<boolean> =>
  user !== null &&
  !user.isAnonymous &&
  termsOutdated(await policies.newestVersion(user.id, "terms"));

/** The card above the composer, wired to its Server Action. */
export function TermsNotice() {
  return <TermsUpdateCard onAccept={acceptTermsAction} />;
}
