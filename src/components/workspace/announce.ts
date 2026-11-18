import type { MessageView } from "./types";

export type AnnounceSnapshot = {
  readonly messages: readonly MessageView[];
  readonly status: string | null;
  /** What the live region holds right now. */
  readonly announcement: string;
};

/**
 * What the Thread's one polite live region should say next (AC-6). Pure.
 * - An assistant message that was streaming and is not any more: its full text, once.
 * - A status text that is new and not empty: that text.
 * Anything else leaves the region as it was, so a screen reader never re-reads it.
 */
export function nextAnnouncement(
  previous: Pick<AnnounceSnapshot, "messages" | "status" | "announcement">,
  messages: readonly MessageView[],
  status: string | null,
): string {
  const wasStreaming = new Set(
    previous.messages.filter((m) => m.streaming).map((m) => m.id),
  );
  const finished = messages
    .filter(
      (m) => m.role === "assistant" && !m.streaming && wasStreaming.has(m.id),
    )
    .map((m) => m.markdown);
  const newStatus =
    status !== null && status !== previous.status ? [status] : [];
  const parts = [...finished, ...newStatus];
  return parts.length > 0 ? parts.join("\n") : previous.announcement;
}
