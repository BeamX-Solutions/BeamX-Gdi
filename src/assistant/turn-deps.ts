/**
 * Server only. The real dependencies of `handleTurn` for the card path: the query layer,
 * the registry, the turn lock, the clock and the logger. The AI turn joins them in
 * build plan task 3.
 */
import * as conversations from "@/db/queries/conversations";
import * as messages from "@/db/queries/messages";
import * as runs from "@/db/queries/runs";
import { newId } from "@/db/id";
import { logEvent } from "@/lib/log";
import { turnLock } from "@/lib/turn-lock";
import { getTool } from "@/tools/registry";
import type { SavedMessage } from "./parts";
import type { TurnDeps } from "./turn";

/** How many recent messages the card path reads (the open card and prefill lookups). */
export const RECENT_MESSAGES = 30;

const recentMessages = async (
  ownerId: string,
  conversationId: string,
): Promise<readonly SavedMessage[]> => {
  const page = await messages.listRecent(
    ownerId,
    conversationId,
    undefined,
    RECENT_MESSAGES,
  );
  return page.ok
    ? page.value.messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      }))
    : [];
};

export const turnQueryDeps: Omit<TurnDeps, "aiTurn"> = {
  ownerOf: conversations.ownerOf,
  lock: turnLock,
  appendMessage: (ownerId, conversationId, message) =>
    messages.append(ownerId, conversationId, [message]),
  getActive: runs.getActive,
  recentMessages,
  getRun: runs.get,
  saveAnswer: runs.saveAnswer,
  complete: runs.complete,
  getTool,
  newId,
  now: () => Date.now(),
  log: logEvent,
};
