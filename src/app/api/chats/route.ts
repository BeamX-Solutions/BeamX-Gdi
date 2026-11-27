/**
 * The history rail's page (feature #14): the session user's chats, newest activity
 * first, 30 a page by an opaque cursor, each with a title and its ready reports. Guests
 * see their own chats too (they move to the account on sign up). No session is an empty
 * list, never an error.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { historyEntries } from "@/assistant/chat-history";
import { sessionUserId } from "@/auth/session";
import * as conversations from "@/db/queries/conversations";
import { getTool } from "@/tools/registry";

const cursorSchema = z.string().min(1).max(200).optional();

const json = (status: number, body: unknown): Response =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const toolName = (id: string): string => {
  const found = getTool(id);
  return found.ok ? found.value.name : id;
};

export async function GET(request: NextRequest) {
  const cursor = cursorSchema.safeParse(
    request.nextUrl.searchParams.get("cursor") ?? undefined,
  );
  if (!cursor.success) return json(400, { code: "invalid_cursor" });
  const userId = await sessionUserId(request.headers);
  if (userId === null) return json(200, { items: [], nextCursor: null });
  const page = await conversations.history(
    userId,
    cursor.data === undefined ? {} : { cursor: cursor.data },
  );
  if (!page.ok) return json(400, { code: page.error.code });
  return json(200, {
    items: historyEntries(page.value.items, toolName),
    nextCursor: page.value.nextCursor,
  });
}
