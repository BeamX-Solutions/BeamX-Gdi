/**
 * The chat route (spec 0007). BotID, then the session, then `postChat`, which validates
 * the body, makes sure the chat exists, runs the turn and saves the reply once. Expected
 * failures are typed JSON, never a raw 500. A turn's reply is also buffered in Redis, so
 * a reload can resume it (`GET /api/chat/[id]/stream`, AC-6).
 */
import { createUIMessageStreamResponse } from "ai";
import type { NextRequest } from "next/server";
import { postChat } from "@/assistant/chat-api";
import { chatApiDeps } from "@/assistant/chat-deps";
import { sessionUser } from "@/auth/session";
import { isBot } from "@/lib/bot-check";
import { requestIp } from "@/lib/client-ip";
import { resumableEnabled, resumableStreams } from "@/lib/resumable";

// Below the turn lock's 120 second expiry, so no turn outlives its lock (spec 0007, 7a).
export const maxDuration = 90;

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (await isBot()) return json(403, { code: "bot" });
  const user = await sessionUser(request.headers);
  if (user === null) return json(401, { code: "unauthenticated" });
  // Read once: a guest who links an account mid turn stays a guest for this request.
  const ip = requestIp(request.headers);
  const body: unknown = await request.json().catch(() => null);
  const result = await postChat(chatApiDeps, {
    userId: user.id,
    isGuest: user.isAnonymous,
    ip,
    body,
  });
  if (result.kind === "json") return json(result.status, result.body);
  const { resumable } = result;
  return createUIMessageStreamResponse({
    stream: result.stream,
    ...(resumable !== null && resumableEnabled
      ? {
          consumeSseStream: ({ stream }: { stream: ReadableStream<string> }) =>
            resumableStreams.start(
              resumable.conversationId,
              resumable.streamId,
              stream,
            ),
        }
      : {}),
  });
}
