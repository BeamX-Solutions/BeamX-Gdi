/**
 * The chat route (spec 0007). BotID, then the session, then `postChat`, which validates
 * the body, makes sure the chat exists, runs the turn and saves the reply once. Expected
 * failures are typed JSON, never a raw 500.
 */
import { createUIMessageStreamResponse } from "ai";
import type { NextRequest } from "next/server";
import { postChat } from "@/assistant/chat-api";
import { chatApiDeps } from "@/assistant/chat-deps";
import { sessionUserId } from "@/auth/session";
import { isBot } from "@/lib/bot-check";

// Below the turn lock's 120 second expiry, so no turn outlives its lock (spec 0007, 7a).
export const maxDuration = 90;

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (await isBot()) return json(403, { code: "bot" });
  const userId = await sessionUserId(request.headers);
  if (userId === null) return json(401, { code: "unauthenticated" });
  const body: unknown = await request.json().catch(() => null);
  const result = await postChat(chatApiDeps, { userId, body });
  return result.kind === "json"
    ? json(result.status, result.body)
    : createUIMessageStreamResponse({ stream: result.stream });
}
