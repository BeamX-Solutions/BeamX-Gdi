import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { billingConfig } from "@/billing/config";
import { PURGE } from "@/db/queries/users";
import { appHostOf, assertLegalReady, TERMS_PATH } from "@/legal/config";
import { privacyNotice } from "@/legal/content";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy notice · BeamX Workspace",
  description: "What BeamX Workspace collects, why, and your choices.",
};

/**
 * The privacy notice (spec 0017, AC-1, AC-2). Static: prerendered from `src/legal/`, with
 * retention read from the guest purge and billing config. A production build fails while
 * `LEGAL` holds a placeholder (AC-9).
 */
export default function PrivacyPage() {
  assertLegalReady(env.VERCEL_ENV);
  return (
    <LegalDocumentView
      document={privacyNotice({
        appHost: appHostOf(env.NEXT_PUBLIC_APP_URL),
        guestDeleteDays: PURGE.staleDays,
        creditExpiryMonths: billingConfig.expiry.inactiveMonths,
      })}
      other={{ href: TERMS_PATH, label: "Terms of use" }}
    />
  );
}
