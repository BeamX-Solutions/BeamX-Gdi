/**
 * The policy footer every email carries (spec 0017, AC-4). The links point at the live
 * policies on the app's public domain (`LEGAL.domain`), whichever deploy sent the email.
 * Pure, shared by the HTML footer and the plain text versions.
 */
import { LEGAL, PRIVACY_PATH, TERMS_PATH } from "@/legal/config";

const base = `https://${LEGAL.domain}`;

export const policyUrls = {
  privacy: `${base}${PRIVACY_PATH}`,
  terms: `${base}${TERMS_PATH}`,
} as const;

export const FOOTER_LEAD = "BeamX Workspace";

/** The plain text footer, appended after a blank line. */
export const footerText = (): string =>
  [
    "",
    "--",
    FOOTER_LEAD,
    `Privacy notice: ${policyUrls.privacy}`,
    `Terms of use: ${policyUrls.terms}`,
  ].join("\n");
