/**
 * Resumes a chat reply after a reload or a dropped network (spec 0007, AC-6). Answers the
 * active stream replayed from its start, or `204` when there is nothing to resume: no
 * session yet, an unknown chat, or a reply that already finished (the page shows the
 * saved message). Another user's chat is `404` with no detail.
 *
 * No session is `204`, not `401`: the client's `401` handling signs a guest in, and a
 * page load must never create a guest (AC-1).
 */
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { sessionUserId } from "@/auth/session";
import * as conversations from "@/db/queries/conversations";
import { resumableStreams } from "@/lib/resumable";

const idSchema = z.uuid();

const nothing = (): Response =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/chat/[id]/stream">,
) {
  const { id } = await ctx.params;
  const conversationId = idSchema.safeParse(id);
  if (!conversationId.success)
    return Response.json(
      { code: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const userId = await sessionUserId(request.headers);
  if (userId === null) return nothing();
  const owner = await conversations.ownerOf(conversationId.data);
  if (!owner.ok) return nothing();
  if (owner.value !== userId)
    return Response.json(
      { code: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  const stream = await resumableStreams.resume(conversationId.data);
  if (stream === null) return nothing();
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
