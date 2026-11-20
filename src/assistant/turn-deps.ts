/**
 * Server only. The real dependencies of `handleTurn`: the query layer, the registry,
 * the turn lock, the clock, the logger, and the AI turn on the `chat` model role.
 */
import * as conversations from "@/db/queries/conversations";
import * as credits from "@/db/queries/credits";
import * as messages from "@/db/queries/messages";
import * as runs from "@/db/queries/runs";
import { newId } from "@/db/id";
import { logEvent } from "@/lib/log";
import { turnLock } from "@/lib/turn-lock";
import { ok } from "@/lib/result";
import { getTool, tools } from "@/tools/registry";
import { createAiTurn, type AiTurnDeps } from "./ai-turn";
import { resolveModel } from "./model-provider";
import type { SavedMessage } from "./parts";
import { STARTER_GRANT } from "./tools/start-run";
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

/** The last 30 messages and the chat's runs, in one batch (`conversations.open`). */
const openChat: AiTurnDeps["openChat"] = async (ownerId, conversationId) => {
  const opened = await conversations.open(ownerId, conversationId, {
    limit: RECENT_MESSAGES,
  });
  if (!opened.ok) return { ok: false, error: { code: "not_found" } };
  return ok({
    messages: opened.value.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
    })),
    runs: opened.value.runs,
  });
};

const aiTurnDeps: AiTurnDeps = {
  ...turnQueryDeps,
  tools,
  openChat,
  model: () => resolveModel("chat"),
  ensureAccount: (ownerId) => credits.ensureAccount(ownerId, STARTER_GRANT),
  startRunWithHold: async (ownerId, conversationId, toolId, version, price) => {
    const started = await credits.startRunWithHold(
      ownerId,
      conversationId,
      toolId,
      version,
      price,
    );
    return started.ok ? ok({ runId: started.value.run.id }) : started;
  },
};

/** Everything `handleTurn` needs in production. */
export const turnDeps: TurnDeps = {
  ...turnQueryDeps,
  aiTurn: createAiTurn(aiTurnDeps),
};
