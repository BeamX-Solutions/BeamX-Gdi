import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { loadChat, toolNames } from "@/assistant/chat-page";
import { sessionUser } from "@/auth/session";
import { needsTermsCard } from "@/auth/terms-card";
import { billingConfig } from "@/billing/config";
import { expiryWarning, toCreditSummary } from "@/billing/summary";
import { AccountControl } from "@/components/auth/account-control";
import { CreditChip } from "@/components/credits/credit-chip";
import * as conversations from "@/db/queries/conversations";
import * as credits from "@/db/queries/credits";
import { Chat } from "@/components/workspace/chat";
import { startCheckoutAction } from "@/app/credits/actions";
import { TermsNotice } from "@/app/terms/notice";

/**
 * A saved chat (spec 0007, AC-5, AC-7). The shell is static; the id, the session and the
 * thread are request reads, so they stream in behind Suspense. Another user's chat is
 * the 404 page; an unknown id is the empty chat.
 */
export default function SavedChatPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<Chat loading toolNames={toolNames()} />}>
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
  const user = await sessionUser(await headers());
  const userId = user?.id ?? null;
  // The thread, the chip's credits and the terms check in parallel: Frankfurt is far
  // from Nigeria.
  const [page, summary, termsCard] = await Promise.all([
    loadChat(
      { open: conversations.open, ownerOf: conversations.ownerOf },
      userId,
      id,
    ),
    userId === null ? null : credits.getSummary(userId),
    needsTermsCard(user),
  ]);
  if (page.kind === "not_found") notFound();
  const credit = toCreditSummary(summary);
  return (
    <Chat
      conversationId={id}
      initialMessages={page.messages}
      toolNames={toolNames()}
      buy={startCheckoutAction}
      notice={termsCard ? <TermsNotice /> : null}
      chip={
        <>
          <CreditChip
            initial={credit}
            expiring={expiryWarning(summary, new Date(), billingConfig)}
          />
          <AccountControl availableCredits={credit?.available ?? 0} />
        </>
      }
    />
  );
}
