/**
 * What the prefill card offers when a run starts (spec 0006, AC-5; spec 0012, AC-6,
 * AC-7): known facts from the chat plus facts from the business profile. Pure.
 */
import {
  parseAnswer,
  visibleQuestions,
  type Answers,
  type AnswerValue,
  type ToolModule,
} from "@/tools/registry";
import type { AnswerSource } from "./parts";

/** A profile fact as the turn reads it (`profile.get`, value unparsed). */
export type ProfileFact = { readonly key: string; readonly value: unknown };

export type PrefillOffer = {
  readonly questionId: string;
  readonly value: AnswerValue;
  readonly source: AnswerSource;
};

/** The card titles: one source names it; both get a neutral title (AC-7). */
export const PREFILL_OFFER_TITLES = {
  chat: "From our chat",
  profile: "From your profile",
  both: "What I already know",
} as const;

/**
 * Chat facts and profile facts for the visible, unanswered questions, in question
 * order. A chat fact wins over the profile for the same question. A profile fact is
 * offered only when its question's `fromFact` gives a value that the question accepts.
 */
export const prefillOffers = (
  tool: Pick<ToolModule, "questions">,
  answers: Answers,
  chat: readonly { readonly questionId: string; readonly value: AnswerValue }[],
  profile: readonly ProfileFact[],
): readonly PrefillOffer[] => {
  const byKey = new Map(profile.map((f) => [f.key, f.value]));
  const chatById = new Map(chat.map((f) => [f.questionId, f.value]));
  return visibleQuestions(tool, answers).flatMap((q): PrefillOffer[] => {
    if (answers[q.id] !== undefined) return [];
    const fromChat = chatById.get(q.id);
    if (fromChat !== undefined)
      return [{ questionId: q.id, value: fromChat, source: "chat" }];
    if (q.fact === undefined || !byKey.has(q.fact.key)) return [];
    const value = q.fact.fromFact(byKey.get(q.fact.key));
    if (value === null) return [];
    const parsed = parseAnswer(tool, q.id, value);
    return parsed.ok
      ? [{ questionId: q.id, value: parsed.value, source: "profile" }]
      : [];
  });
};

/** The title for these offers (AC-7). */
export const prefillOfferTitle = (offers: readonly PrefillOffer[]): string => {
  const profile = offers.some((o) => o.source === "profile");
  const chat = offers.some((o) => o.source !== "profile");
  return profile && chat
    ? PREFILL_OFFER_TITLES.both
    : profile
      ? PREFILL_OFFER_TITLES.profile
      : PREFILL_OFFER_TITLES.chat;
};
