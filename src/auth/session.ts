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
