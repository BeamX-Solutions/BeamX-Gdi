/**
 * Server only. The real dependencies of `postChat`: the query layer, `handleTurn` on its
 * production deps, and Next's `after` for work that outlives the response.
 */
import { after } from "next/server";
import { billingConfig } from "@/billing/config";
import { toCreditSummary } from "@/billing/summary";
import * as conversations from "@/db/queries/conversations";
import * as credits from "@/db/queries/credits";
import * as messages from "@/db/queries/messages";
import * as usage from "@/db/queries/usage";
import { newId } from "@/db/id";
import { env } from "@/lib/env";
import { chatGuards, limits } from "@/lib/limits";
import { guestSpendCap, withSpend } from "@/lib/spend-cap";
import { logEvent } from "@/lib/log";
import { resumableStreams } from "@/lib/resumable";
import type { ChatApiDeps } from "./chat-api";
import { freeChatCounters, openCreditAccount } from "./billing-deps";
import { handleTurn } from "./turn";
import { turnDeps } from "./turn-deps";

export const chatApiDeps: ChatApiDeps = {
  turnContext: conversations.turnContext,
  handleTurn: (input) => handleTurn(turnDeps, input),
  ownerOf: conversations.ownerOf,
  appendMessage: (ownerId, conversationId, message) =>
    messages.append(ownerId, conversationId, [message]),
  recordUsage: withSpend(usage.record),
  guestSpendCap,
  guards: chatGuards,
  finishStream: resumableStreams.finish,
  limits: {
    maxChars: env.MAX_MESSAGE_CHARS,
    perRun: env.RATE_LIMIT_MESSAGES_PER_RUN,
    chatPerGuest: limits.chatPerGuest,
    chatsPerGuest: limits.chatsPerGuest,
  },
  billing: {
    config: billingConfig,
    freeUsed: freeChatCounters.used,
    countFree: freeChatCounters.count,
    noticeOnce: freeChatCounters.noticeOnce,
    openAccount: openCreditAccount,
    holdChat: credits.holdForChat,
    settleChat: async (holdId, charged) =>
      toCreditSummary(await credits.settleChat(holdId, charged)),
  },
  waitUntil: (task) => {
    after(task);
  },
  newId,
  log: logEvent,
};
