/**
 * The auth POSTs that are BotID checked (spec 0009, AC-15). Pure constants, safe to import
 * from client code: `src/instrumentation-client.ts` lists the same paths in BotID's
 * `protect`, and the auth route checks them with `isBot()`. A path missing from either
 * side makes every real user look like a bot (or lets bots through), so both read this.
 */

/** Better Auth's mount point. */
export const AUTH_BASE = "/api/auth";

/** Better Auth paths (without `AUTH_BASE`) that run `isBot()` before the handler. */
export const BOT_CHECKED_AUTH_PATHS = [
  "/sign-in/email",
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
] as const;

/** Our own account routes, each BotID checked in its handler. */
export const BOT_CHECKED_ACCOUNT_PATHS = [
  "/api/account/email-check",
  "/api/account/set-password",
  "/api/account/delete",
] as const;

/** True when a Better Auth path (without `AUTH_BASE`) is BotID checked. Pure. */
export const isBotCheckedAuthPath = (path: string): boolean =>
  (BOT_CHECKED_AUTH_PATHS as readonly string[]).includes(path);

/** Every full path BotID's client script must protect for the auth feature. */
export const BOT_PROTECTED_AUTH_PATHS: readonly string[] = [
  `${AUTH_BASE}/sign-in/anonymous`,
  ...BOT_CHECKED_AUTH_PATHS.map((p) => `${AUTH_BASE}${p}`),
  ...BOT_CHECKED_ACCOUNT_PATHS,
];
