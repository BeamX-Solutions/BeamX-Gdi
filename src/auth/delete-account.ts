/**
 * Deleting your own account (spec 0009, AC-13). Pure, safe to import from client code:
 * the delete dialog and `/api/account/delete` both use it, so the typed email is checked
 * the same way on both sides.
 */

const normalize = (email: string): string => email.trim().toLowerCase();

/** True when the email the user typed is their account's email, ignoring case. Pure. */
export const typedEmailMatches = (
  typed: string,
  accountEmail: string,
): boolean =>
  typed.trim().length > 0 && normalize(typed) === normalize(accountEmail);

/** Better Auth's code when the session is older than `freshAge` (one day). */
export const SESSION_EXPIRED = "SESSION_EXPIRED";

/** Our route's code when the typed email is not the account's. */
export const EMAIL_MISMATCH = "email_mismatch";
