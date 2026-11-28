import { TermsUpdateCard } from "@/components/legal/terms-update-card";
import { acceptTermsAction } from "./actions";

/**
 * The updated terms card above the composer, wired to its Server Action (spec 0017,
 * AC-6). Whether to show it is `needsTermsCard` in `src/auth/terms-card.ts`.
 */
export function TermsNotice() {
  return <TermsUpdateCard onAccept={acceptTermsAction} />;
}
