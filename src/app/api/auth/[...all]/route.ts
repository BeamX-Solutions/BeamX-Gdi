/**
 * Better Auth's handler (spec 0007). The anonymous sign in is BotID checked first, so a
 * bot can't mint guests; everything else goes straight to Better Auth.
 */
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { auth } from "@/auth/auth";
import { isBot } from "@/lib/bot-check";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(request: NextRequest) {
  if (
    new URL(request.url).pathname.endsWith("/sign-in/anonymous") &&
    (await isBot())
  )
    return Response.json({ code: "bot" }, { status: 403 });
  return handler.POST(request);
}
