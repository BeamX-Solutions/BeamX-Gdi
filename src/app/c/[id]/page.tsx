import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { loadChat } from "@/assistant/chat-page";
import { sessionUserId } from "@/auth/session";
import * as conversations from "@/db/queries/conversations";
import { Chat } from "@/components/workspace/chat";

/**
 * A saved chat (spec 0007, AC-5, AC-7). The shell is static; the id, the session and the
 * thread are request reads, so they stream in behind Suspense. Another user's chat is
 * the 404 page; an unknown id is the empty chat.
 */
export default function SavedChatPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<Chat loading />}>
      <SavedChat params={params} />
    </Suspense>
  );
}

async function SavedChat({ params }: Pick<PageProps<"/c/[id]">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  // The thread is per request: stop any prerender or runtime prefetch here, before the
  // session and DB reads start (an aborted read logs a Better Auth error).
  await connection();
  const userId = await sessionUserId(await headers());
  const page = await loadChat(
    { open: conversations.open, ownerOf: conversations.ownerOf },
    userId,
    id,
  );
  if (page.kind === "not_found") notFound();
  return <Chat conversationId={id} initialMessages={page.messages} />;
}
