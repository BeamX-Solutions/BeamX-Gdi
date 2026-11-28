/**
 * Server only. Who sees the updated terms card (spec 0017, AC-6): a signed in account
 * behind on the terms or the privacy notice. Guests never.
 *
 * The card is optional and never blocks the chat, so a failed lookup hides it (logged as
 * `terms_check_failed`) instead of failing the page it sits on. The read is passed in so
 * the rule has unit tests.
 */
import * as policies from "@/db/queries/policies";
import { policiesOutdated, type NewestVersions } from "@/legal/config";
import { logEvent } from "@/lib/log";
import type { SessionUser } from "./session";

export type TermsCardDeps = {
  readonly newestVersions: (userId: string) => Promise<NewestVersions>;
  readonly log: typeof logEvent;
};

export const termsCardCheck =
  (deps: TermsCardDeps) =>
  async (user: SessionUser | null): Promise<boolean> => {
    if (user === null || user.isAnonymous) return false;
    try {
      return policiesOutdated(await deps.newestVersions(user.id));
    } catch {
      deps.log("terms_check_failed", { userId: user.id });
      return false;
    }
  };

export const needsTermsCard = termsCardCheck({
  newestVersions: policies.newestVersions,
  log: logEvent,
});
