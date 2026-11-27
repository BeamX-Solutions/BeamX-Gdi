/**
 * Server only. The real dependencies of `handleTurn`: the query layer, the registry,
 * the turn lock, the clock, the logger, and the AI turn on the `chat` model role.
 */
import * as consultations from "@/db/queries/consultations";
import * as conversations from "@/db/queries/conversations";
import * as credits from "@/db/queries/credits";
import * as messages from "@/db/queries/messages";
import * as profile from "@/db/queries/profile";
import * as runs from "@/db/queries/runs";
import * as usage from "@/db/queries/usage";
import { openCreditAccount } from "./billing-deps";
import { toCreditSummary } from "@/billing/summary";
import { newId } from "@/db/id";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { turnLock } from "@/lib/turn-lock";
import { ok } from "@/lib/result";
import { giveBackRun, takeRun } from "@/lib/limits";
import { guestSpendCap, withSpend } from "@/lib/spend-cap";
import { getTool, tools } from "@/tools/registry";
import { createAiTurn, type AiTurnDeps } from "./ai-turn";
import { resolveModel } from "./model-provider";
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
  ensureAccount: openCreditAccount,
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
  getSummary: async (ownerId) =>
    toCreditSummary(await credits.getSummary(ownerId)),
  runQuote: credits.runQuote,
  resumeRun: async (ownerId, runId) => {
    const resumed = await runs.resume(ownerId, runId);
    return resumed.ok ? ok({ runId: resumed.value.run.id }) : resumed;
  },
  resumeRunWithHold: async (ownerId, runId, price) => {
    const resumed = await credits.resumeRunWithHold(ownerId, runId, price);
    return resumed.ok ? ok({ runId: resumed.value.run.id }) : resumed;
  },
  startFromWithHold: async (ownerId, previousRunId, version, price) => {
    const started = await credits.startFromWithHold(
      ownerId,
      previousRunId,
      version,
      price,
    );
    return started.ok ? ok({ runId: started.value.run.id }) : started;
  },
  abandonRun: runs.abandon,
  offerConsultation: consultations.offer,
  calendlyUrl: env.CALENDLY_URL,
  limits: { guestSpendCap, takeRun, giveBackRun },
  helperModel: () => resolveModel("helper"),
  recordUsage: withSpend(usage.record),
  profileFacts: profile.get,
  oldAnswers: async (ownerId, runId) => {
    const read = await runs.get(ownerId, runId);
    return read.ok
      ? ok(
          read.value.answers.map((a) => ({
            questionId: a.questionId,
            value: a.value,
            source: a.source,
          })),
        )
      : read;
  },
};

/** Everything `handleTurn` needs in production. */
export const turnDeps: TurnDeps = {
  ...turnQueryDeps,
  aiTurn: createAiTurn(aiTurnDeps),
};
