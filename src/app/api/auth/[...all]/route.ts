/**
 * Better Auth's handler (spec 0007). The anonymous sign in is BotID checked first, so a
 * bot can't mint guests, then held to the guest per IP cap (spec 0008, AC-8).
 * `/sign-up/email` is blocked: accounts are only created by the email code sign in, so no
 * unverified account can exist (spec 0009). `/delete-user` is blocked too: our own
 * `/api/account/delete` route is the only way in. The other auth POSTs of spec 0009 AC-15 are
 * BotID checked too, then rate limited by Better Auth itself (`rateLimit` in `auth.ts`);
 * its `429` gets our `rate_limited` code so the dialog can say so.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { after, type NextRequest } from "next/server";
import { auth } from "@/auth/auth";
import { limitGuestSignIn } from "@/auth/guest-limit";
import { AUTH_BASE, isBotCheckedAuthPath } from "@/auth/paths";
import { RATE_LIMITED_BODY } from "@/auth/rate-limit";
import { isBot } from "@/lib/bot-check";
import { requestIp } from "@/lib/client-ip";
import { guestGuards, limits } from "@/lib/limits";
import { logEvent } from "@/lib/log";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Better Auth endpoints we never serve over HTTP: `/sign-up/email` (accounts come only
 * from the code sign in) and `/delete-user` (only `/api/account/delete` deletes, after
 * BotID and the typed email check, spec 0009 AC-13).
 */
const BLOCKED_PATHS: ReadonlySet<string> = new Set([
  "/sign-up/email",
  "/delete-user",
]);

const BOT = () => Response.json({ code: "bot" }, { status: 403 });

/** Better Auth's `429` has only a message; keep its retry header, add our code. */
const withRateLimitCode = (response: Response): Response => {
  if (response.status !== 429) return response;
  logEvent("auth_rate_limited", {});
  return Response.json(RATE_LIMITED_BODY, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "X-Retry-After": response.headers.get("X-Retry-After") ?? "60",
    },
  });
};

export async function POST(request: NextRequest) {
  // Without the mount point or a trailing slash, the way Better Auth matches paths.
  const path = new URL(request.url).pathname
    .slice(AUTH_BASE.length)
    .replace(/\/+$/, "");
  if (BLOCKED_PATHS.has(path))
    return Response.json({ code: "not_found" }, { status: 404 });
  if (path === "/sign-in/anonymous") {
    if (await isBot()) return BOT();
    return limitGuestSignIn(
      {
        guard: guestGuards,
        max: limits.guestsPerIp,
        waitUntil: (task) => {
          after(task);
        },
        log: logEvent,
      },
      requestIp(request.headers),
      () => handler.POST(request),
    );
  }
  if (isBotCheckedAuthPath(path) && (await isBot())) return BOT();
  return withRateLimitCode(await handler.POST(request));
}
