import { createAuthMiddleware } from "better-auth/api";

/**
 * Drops a stale session cookie before a sign in (spec 0009, AC-5, AC-10).
 *
 * The anonymous plugin's after hook looks up the request's session on every sign in, to
 * find a guest to link. When the cookie points at a revoked or expired session (after a
 * password reset, a delete, or a purged guest), that lookup expires the session cookie in
 * the response, after the sign in already set the new one, so the browser ends up signed
 * out. Removing the dead cookie from the request first leaves nothing to expire. A live
 * cookie (a guest to link) is kept.
 */

/** The paths the anonymous plugin's after hook runs on (better-auth 1.7.25). */
const SIGN_IN_PREFIXES: readonly string[] = [
  "/sign-in",
  "/sign-up",
  "/callback",
  "/magic-link/verify",
  "/email-otp/verify-email",
  "/one-tap/callback",
  "/passkey/verify-authentication",
  "/phone-number/verify",
  "/verify-email",
];

/** True when Better Auth's anonymous plugin may look up the session after this path. Pure. */
export const isSignInPath = (path: string | undefined): boolean =>
  path !== undefined && SIGN_IN_PREFIXES.some((p) => path.startsWith(p));

/** A `Cookie` header without the cookies `drop` matches. Pure. */
export const withoutCookies = (
  cookieHeader: string,
  drop: (name: string) => boolean,
): string =>
  cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !drop(part.split("=")[0] ?? ""))
    .join("; ");

export const dropStaleSessionCookie = createAuthMiddleware(async (ctx) => {
  if (!isSignInPath(ctx.path)) return;
  const cookieHeader = ctx.headers?.get("cookie");
  if (!cookieHeader) return;
  const { sessionToken, sessionData, dontRememberToken } =
    ctx.context.authCookies;
  const token = await ctx.getSignedCookie(
    sessionToken.name,
    ctx.context.secret,
  );
  // No signed session cookie: nothing the plugin would look up, so nothing to expire.
  if (!token) return;
  const found = await ctx.context.internalAdapter.findSession(token);
  if (found && found.session.expiresAt > new Date()) return;
  const headers = new Headers(ctx.headers);
  headers.set(
    "cookie",
    withoutCookies(
      cookieHeader,
      (name) =>
        name === sessionToken.name ||
        name.startsWith(sessionData.name) ||
        name === dontRememberToken.name,
    ),
  );
  return { context: { headers } };
});
