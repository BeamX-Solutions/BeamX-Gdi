/**
 * The legal settings (spec 0017): who BeamX is, how to reach it, and the version of each
 * policy. Pure, so the pages, the sign up record and the updated terms card all read the
 * same values.
 *
 * Bump a version whenever its policy's words change in substance. A new `termsVersion`
 * shows every account the "We've updated our terms" card once (AC-6).
 */

/** Marks a value the company still has to supply. `placeholderFields` finds them. */
export const PLACEHOLDER = "[PLACEHOLDER]";

export type LegalConfig = {
  /** The registered company name. */
  readonly company: string;
  /** The registered address, one line. */
  readonly address: string;
  /** Where privacy requests and questions go. */
  readonly privacyEmail: string;
  readonly termsVersion: string;
  readonly privacyVersion: string;
  /** "Last updated" on each page, as `YYYY-MM-DD`. */
  readonly termsUpdated: string;
  readonly privacyUpdated: string;
};

// From beamxsolutions.com (2026-11-28): the site gives the brand name and the office
// address only. Swap in the registered name (and RC number) once the lawyer confirms it.
export const LEGAL: LegalConfig = {
  company: "BeamX Solutions",
  address:
    "97 Adeola Odeku Street, 2nd Floor, Union Bank Building, Victoria Island, Lagos, Nigeria",
  privacyEmail: "info@beamxsolutions.com",
  termsVersion: "2026-11-28",
  privacyVersion: "2026-11-28",
  termsUpdated: "2026-11-28",
  privacyUpdated: "2026-11-28",
};

/** The `LEGAL` fields that still hold a placeholder. Pure (AC-9). */
export const placeholderFields = (
  config: LegalConfig,
): readonly (keyof LegalConfig)[] =>
  (Object.keys(config) as (keyof LegalConfig)[]).filter((key) =>
    config[key].includes(PLACEHOLDER),
  );

/**
 * Throws on a production deploy while any field is a placeholder, so the policy pages
 * fail the production build instead of shipping unnamed (AC-9). Other deploys show the
 * placeholders as they are.
 */
export const assertLegalReady = (
  vercelEnv: string | undefined,
  config: LegalConfig = LEGAL,
): void => {
  if (vercelEnv !== "production") return;
  const missing = placeholderFields(config);
  if (missing.length > 0)
    throw new Error(
      `LEGAL still has placeholders in production: ${missing.join(", ")}`,
    );
};

export type PolicyKind = "terms" | "privacy";

/** The current version of a policy. */
export const currentVersion = (policy: PolicyKind): string => {
  switch (policy) {
    case "terms":
      return LEGAL.termsVersion;
    case "privacy":
      return LEGAL.privacyVersion;
    default: {
      const never: never = policy;
      return never;
    }
  }
};

export const POLICY_KINDS: readonly PolicyKind[] = ["terms", "privacy"];

export type Acceptance = {
  readonly policy: PolicyKind;
  readonly version: string;
};

/**
 * What accepting means, at sign up (AC-5) and on the updated terms card's OK (AC-6): the
 * current version of both policies. One list, so the two can never drift apart.
 */
export const currentAcceptances = (): readonly Acceptance[] =>
  POLICY_KINDS.map((policy) => ({ policy, version: currentVersion(policy) }));

/** The newest version of each policy an account accepted, null for none. */
export type NewestVersions = Readonly<Record<PolicyKind, string | null>>;

/**
 * True when an account should see the updated terms card (AC-6): its newest accepted
 * version of either policy is not the current one, or it has none (an account from
 * before this feature, or a sign up whose record failed). Versions are compared for
 * equality, not order. Pure.
 */
export const policiesOutdated = (newest: NewestVersions): boolean =>
  POLICY_KINDS.some((policy) => newest[policy] !== currentVersion(policy));

/**
 * The host of an app URL (`beam-x-gdi.vercel.app`), or null when it isn't a URL (a CI
 * build with `SKIP_ENV_VALIDATION` and no app URL). Pure.
 */
export const appHostOf = (appUrl: string): string | null => {
  try {
    return new URL(appUrl).host || null;
  } catch {
    return null;
  }
};

export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
