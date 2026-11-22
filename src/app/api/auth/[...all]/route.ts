/**
 * Better Auth's handler (spec 0007). The anonymous sign in is BotID checked first, so a
 * bot can't mint guests, then held to the guest per IP cap (spec 0008, AC-8);
 * everything else goes straight to Better Auth.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { after, type NextRequest } from "next/server";
import { auth } from "@/auth/auth";
import { limitGuestSignIn } from "@/auth/guest-limit";
import { isBot } from "@/lib/bot-check";
import { requestIp } from "@/lib/client-ip";
import { guestGuards, limits } from "@/lib/limits";
import { logEvent } from "@/lib/log";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(request: NextRequest) {
  if (!new URL(request.url).pathname.endsWith("/sign-in/anonymous"))
    return handler.POST(request);
  if (await isBot()) return Response.json({ code: "bot" }, { status: 403 });
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
