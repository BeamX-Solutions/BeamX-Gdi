/**
 * Sets the password of the account that was just created by the email code sign in
 * (spec 0009, AC-2). Only a signed in, non guest session may call it, so a password is
 * only ever attached inside a session that proved control of the email. Better Auth's
 * `setPassword` is server only.
 *
 * The breach check runs here, explicitly: the haveIBeenPwned plugin only sees requests
 * that come through the auth handler, not this direct server call (AC-2). Like the
 * plugin, an unreachable breach service refuses rather than letting the password through.
 */
import { isPasswordCompromised } from "better-auth/plugins";
import { z } from "zod";
import { authFailure } from "@/auth/api-error";
import { auth } from "@/auth/auth";
import {
  allowSetPassword,
  authRateLimiter,
  RATE_LIMITED_BODY,
} from "@/auth/rate-limit";
import { isBot } from "@/lib/bot-check";
import { requestIp } from "@/lib/client-ip";

const bodySchema = z.object({ password: z.string().min(8).max(128) });

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  // BotID and the per IP limit first (AC-15): Better Auth's own limit never sees this
  // route, because it calls the server API directly.
  if (await isBot()) return json(403, { code: "bot" });
  if (!(await allowSetPassword(authRateLimiter, requestIp(request.headers))))
    return json(429, RATE_LIMITED_BODY);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null || session.user.isAnonymous === true)
    return json(401, { code: "unauthenticated" });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json(422, { code: "invalid_password" });
  try {
    if (await isPasswordCompromised(body.data.password))
      return json(400, { code: "PASSWORD_COMPROMISED" });
  } catch {
    return json(503, { code: "PASSWORD_CHECK_FAILED" });
  }
  try {
    await auth.api.setPassword({
      headers: request.headers,
      body: { newPassword: body.data.password },
    });
    return json(200, { ok: true });
  } catch (e) {
    const failure = authFailure(e);
    if (failure === null) throw e;
    return json(failure.status, { code: failure.code });
  }
}
