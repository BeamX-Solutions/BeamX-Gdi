/**
 * Server only. The signed in user (guest or account) for a request, or null. Route
 * handlers pass the request headers; Better Auth reads its session cookie from them.
 */
import { auth } from "./auth";

export const sessionUserId = async (
  headers: Headers,
): Promise<string | null> => {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
};

export type SessionUser = {
  readonly id: string;
  readonly isAnonymous: boolean;
};

/**
 * The session user with whether they are a guest (Better Auth's anonymous plugin), or
 * null. Only `isAnonymous === true` is a guest; an account never meets guest limits.
 */
export const sessionUser = async (
  headers: Headers,
): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers });
  return session
    ? { id: session.user.id, isAnonymous: session.user.isAnonymous === true }
    : null;
};

export type SessionAccount = SessionUser & { readonly email: string };

/** The session user with their email (the checkout's Paystack customer), or null. */
export const sessionAccount = async (
  headers: Headers,
): Promise<SessionAccount | null> => {
  const session = await auth.api.getSession({ headers });
  return session
    ? {
        id: session.user.id,
        isAnonymous: session.user.isAnonymous === true,
        email: session.user.email,
      }
    : null;
};
