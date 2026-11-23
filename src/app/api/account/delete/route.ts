/**
 * Deletes the signed in user's account (spec 0009, AC-13, flow 5). BotID checked (AC-15).
 * The typed email must match the session's, checked again here, then Better Auth's
 * `deleteUser` runs without a password, so it refuses a session older than a day with
 * `SESSION_EXPIRED` (the dialog then asks the user to sign in again). The user row goes
 * and everything that hangs off it cascades (spec 0002 AC-7, spec 0004 AC-19); the
 * response clears the session cookie.
 */
import { z } from "zod";
import { authFailure } from "@/auth/api-error";
import { auth } from "@/auth/auth";
import { EMAIL_MISMATCH, typedEmailMatches } from "@/auth/delete-account";
import { isBot } from "@/lib/bot-check";
import { logEvent } from "@/lib/log";

const bodySchema = z.object({ email: z.string().max(254) });

const json = (status: number, body: unknown, headers?: Headers): Response => {
  const out = new Headers(headers);
  out.set("Cache-Control", "no-store");
  out.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: out });
};

/** Only the `Set-Cookie` lines of Better Auth's response, which expire the session. */
const cookiesOf = (headers: Headers): Headers => {
  const out = new Headers();
  for (const cookie of headers.getSetCookie()) out.append("Set-Cookie", cookie);
  return out;
};

export async function POST(request: Request) {
  if (await isBot()) return json(403, { code: "bot" });
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null || session.user.isAnonymous === true)
    return json(401, { code: "unauthenticated" });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !typedEmailMatches(body.data.email, session.user.email))
    return json(403, { code: EMAIL_MISMATCH });
  try {
    const deleted = await auth.api.deleteUser({
      headers: request.headers,
      body: {},
      returnHeaders: true,
    });
    logEvent("account_deleted", { userId: session.user.id });
    return json(200, { ok: true }, cookiesOf(deleted.headers));
  } catch (e) {
    const failure = authFailure(e);
    if (failure === null) throw e;
    return json(failure.status, { code: failure.code });
  }
}
