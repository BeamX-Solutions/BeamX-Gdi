/**
 * Turns an error Better Auth throws from `auth.api.*` into the status and code our routes
 * answer with, so the auth dialog can show its own copy (spec 0009). Anything that is not
 * a Better Auth error is not expected and stays a throw.
 */
import { isAPIError } from "better-auth/api";

export type AuthFailure = { readonly status: number; readonly code: string };

export const authFailure = (e: unknown): AuthFailure | null => {
  if (!isAPIError(e)) return null;
  const code: unknown = (e.body as { code?: unknown } | undefined)?.code;
  return {
    status: e.statusCode,
    code: typeof code === "string" ? code : "AUTH_ERROR",
  };
};
