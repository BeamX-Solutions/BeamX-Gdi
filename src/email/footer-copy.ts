/**
 * The policy footer every email carries (spec 0017, AC-4). The links point at the
 * policies on the app URL of the deploy that sent the email (`NEXT_PUBLIC_APP_URL`, passed
 * in by `send.ts`), so they follow the production address with no code change. Pure,
 * shared by the HTML footer and the plain text versions.
 */
import { PRIVACY_PATH, TERMS_PATH } from "@/legal/config";

export const policyUrls = (appUrl: string) => {
  const base = appUrl.replace(/\/+$/, "");
  return {
    privacy: `${base}${PRIVACY_PATH}`,
    terms: `${base}${TERMS_PATH}`,
  } as const;
};

export const FOOTER_LEAD = "BeamX Workspace";

/** The plain text footer, appended after a blank line. */
export const footerText = (appUrl: string): string => {
  const urls = policyUrls(appUrl);
  return [
    "",
    "--",
    FOOTER_LEAD,
    `Privacy notice: ${urls.privacy}`,
    `Terms of use: ${urls.terms}`,
  ].join("\n");
};
