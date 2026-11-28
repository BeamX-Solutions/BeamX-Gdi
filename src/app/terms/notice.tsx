import type { SessionUser } from "@/auth/session";
import { TermsUpdateCard } from "@/components/legal/terms-update-card";
import * as policies from "@/db/queries/policies";
import { policiesOutdated } from "@/legal/config";
import { acceptTermsAction } from "./actions";

/**
 * True when this session should see the updated terms card (spec 0017, AC-6): a signed
 * in account behind on the terms or the privacy notice. Guests never.
 */
export const needsTermsCard = async (
  user: SessionUser | null,
): Promise<boolean> =>
  user !== null &&
  !user.isAnonymous &&
  policiesOutdated(await policies.newestVersions(user.id));

/** The card above the composer, wired to its Server Action. */
export function TermsNotice() {
  return <TermsUpdateCard onAccept={acceptTermsAction} />;
}
