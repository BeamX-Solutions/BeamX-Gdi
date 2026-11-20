/**
 * Server only. The real dependencies of `postChat`: the query layer, `handleTurn` on its
 * production deps, and Next's `after` for work that outlives the response.
 */
import { after } from "next/server";
import * as conversations from "@/db/queries/conversations";
import * as messages from "@/db/queries/messages";
import * as usage from "@/db/queries/usage";
import { newId } from "@/db/id";
import { logEvent } from "@/lib/log";
import type { ChatApiDeps } from "./chat-api";
import { handleTurn } from "./turn";
import { turnDeps } from "./turn-deps";

export const chatApiDeps: ChatApiDeps = {
  turnContext: conversations.turnContext,
  handleTurn: (input) => handleTurn(turnDeps, input),
  ownerOf: conversations.ownerOf,
  appendMessage: (ownerId, conversationId, message) =>
    messages.append(ownerId, conversationId, [message]),
  recordUsage: usage.record,
  waitUntil: (task) => {
    after(task);
  },
  newId,
  log: logEvent,
};
