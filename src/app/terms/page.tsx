import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { billingConfig } from "@/billing/config";
import { appHostOf, assertLegalReady, PRIVACY_PATH } from "@/legal/config";
import { termsOfUse } from "@/legal/content";
import { env } from "@/lib/env";
import { tools } from "@/tools/registry";

export const metadata: Metadata = {
  title: "Terms of use · BeamX Workspace",
  description: "The terms for using BeamX Workspace and its credits.",
};

/**
 * The terms of use (spec 0017, AC-1, AC-3). Static: prerendered from `src/legal/`, with
 * prices read from the tool modules and billing config. A production build fails while
 * `LEGAL` holds a placeholder (AC-9).
 */
export default function TermsPage() {
  assertLegalReady(env.VERCEL_ENV);
  return (
    <LegalDocumentView
      document={termsOfUse({
        appHost: appHostOf(env.NEXT_PUBLIC_APP_URL),
        tools: tools.map((t) => ({ name: t.name, credits: t.creditPrice })),
        ngnPerCredit: billingConfig.ngnPerCredit,
        freeChatPerDay: billingConfig.chat.freePerDay,
        creditExpiryMonths: billingConfig.expiry.inactiveMonths,
      })}
      other={{ href: PRIVACY_PATH, label: "Privacy notice" }}
    />
  );
}
