/**
 * What `/c/[id]` shows (spec 0007, AC-5, AC-7): the saved thread for its owner, the empty
 * chat for an unknown id (the client creates it on the first send), or not found for a
 * chat that belongs to someone else. One round trip for an owned chat.
 */
import type { UIMessage } from "ai";
import type { Result } from "@/lib/result";
import { tools } from "@/tools/registry";
import type { ChatDataParts } from "./parts";

export type ChatUIMessage = UIMessage<unknown, ChatDataParts>;

type SavedRow = {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: unknown;
};

export type ChatPageDeps = {
  readonly open: (
    userId: string,
    conversationId: string,
  ) => Promise<Result<{ readonly messages: readonly SavedRow[] }, unknown>>;
  readonly ownerOf: (
    conversationId: string,
  ) => Promise<Result<string, unknown>>;
};

export type ChatPage =
  | { readonly kind: "not_found" }
  | { readonly kind: "chat"; readonly messages: readonly ChatUIMessage[] };

/** Saved rows as UI messages for `useChat`; system rows never reach the client. */
export const toUIMessages = (
  rows: readonly SavedRow[],
): readonly ChatUIMessage[] =>
  rows.flatMap((row) =>
    row.role === "system" || !Array.isArray(row.parts)
      ? []
      : [
          {
            id: row.id,
            role: row.role,
            parts: row.parts as ChatUIMessage["parts"],
          },
        ],
  );

export const loadChat = async (
  deps: ChatPageDeps,
  userId: string | null,
  conversationId: string,
): Promise<ChatPage> => {
  if (userId !== null) {
    const opened = await deps.open(userId, conversationId);
    if (opened.ok)
      return { kind: "chat", messages: toUIMessages(opened.value.messages) };
  }
  // Not ours: an existing chat is someone else's (404), a missing one starts empty.
  const owner = await deps.ownerOf(conversationId);
  return owner.ok ? { kind: "not_found" } : { kind: "chat", messages: [] };
};

/** Every registered tool's name by id, for the confirm card ("Start Stellar?"). Pure. */
export const toolNames = (): Readonly<Record<string, string>> =>
  Object.fromEntries(tools.map((t) => [t.id, t.name]));
