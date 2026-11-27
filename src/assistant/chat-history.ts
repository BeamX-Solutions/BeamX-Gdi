/**
 * The history rail's items (feature #14), from a page of `conversations.history`. Pure:
 * a chat's title is its stored title, else the start of its first message, else "New
 * chat"; its reports are named by tool.
 */
import type { HistoryChat } from "@/db/queries/conversations";

export const TITLE_MAX = 60;
export const UNTITLED = "New chat";

export type HistoryEntry = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  /** "Beacon report" or "Beacon and Luna reports", or null with no ready report. */
  readonly reports: string | null;
};

/** The first text of a stored message's parts, or null. */
const firstText = (parts: unknown): string | null => {
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (
      part !== null &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      const text = (part as { text: string }).text.replace(/\s+/g, " ").trim();
      if (text !== "") return text;
    }
  }
  return null;
};

export const chatTitle = (
  chat: Pick<HistoryChat, "title" | "firstUserParts">,
): string => {
  const stored = chat.title?.trim();
  const text =
    stored && stored !== "" ? stored : firstText(chat.firstUserParts);
  if (text === null || text === undefined) return UNTITLED;
  return text.length > TITLE_MAX
    ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : text;
};

const joinNames = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** "Beacon report", "Beacon and Luna reports" (each tool once, newest first). */
export const reportsLine = (
  toolIds: readonly string[],
  toolName: (id: string) => string,
): string | null => {
  const names = [...new Set(toolIds.map(toolName))];
  if (names.length === 0) return null;
  return `${joinNames(names)} ${names.length === 1 ? "report" : "reports"}`;
};

export const historyEntries = (
  chats: readonly HistoryChat[],
  toolName: (id: string) => string,
): readonly HistoryEntry[] =>
  chats.map((c) => ({
    id: c.id,
    title: chatTitle(c),
    href: `/c/${c.id}`,
    reports: reportsLine(c.readyToolIds, toolName),
  }));
