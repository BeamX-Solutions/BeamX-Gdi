"use client";

import { useState, type ReactNode } from "react";
import { Conversation } from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { nextAnnouncement } from "./announce";
import { useNotice } from "./notice-context";
import { StatusLine } from "./status-line";
import type { MessageView, ThreadEntry } from "./types";

type ThreadProps = {
  readonly messages: readonly MessageView[];
  /** Plain text status while the assistant works; null when idle. */
  readonly status: string | null;
  /**
   * The thread in order, cards between messages. When absent, `messages` are drawn.
   * Announcements always come from `messages`.
   */
  readonly entries?: readonly ThreadEntry[];
  /** Answer cards, the report card, and error cards, shown after the last message. */
  readonly children?: ReactNode;
  readonly label?: string;
};

/**
 * The conversation. It sticks to the bottom while text streams (a "Jump to latest" button
 * shows if the reader scrolled up) and owns the one `aria-live="polite"` region: a reply
 * is announced once, in full, when it stops streaming, and each new status text is
 * announced too (AC-6). A workspace notice (the toast, spec 0009) is announced the same
 * way, without showing in the status line.
 */
export function Thread({
  messages,
  status,
  entries,
  children,
  label,
}: ThreadProps) {
  // The status line shows `status`; the live region also speaks a workspace notice.
  const { notice } = useNotice();
  const spoken = status ?? notice;
  const [tracked, setTracked] = useState({
    messages,
    status: spoken,
    announcement: "",
  });
  if (tracked.messages !== messages || tracked.status !== spoken) {
    setTracked({
      messages,
      status: spoken,
      announcement: nextAnnouncement(tracked, messages, spoken),
    });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Conversation label={label}>
        {(
          entries ??
          messages.map((message): ThreadEntry => ({ kind: "message", message }))
        ).map((entry) =>
          entry.kind === "message" ? (
            <MessageBubble key={entry.message.id} message={entry.message} />
          ) : (
            <div key={entry.id} className="flex min-w-0 flex-col">
              {entry.node}
            </div>
          ),
        )}
        <StatusLine text={status} />
        {children}
      </Conversation>
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="thread-live-region"
        className="sr-only"
      >
        {tracked.announcement}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { readonly message: MessageView }) {
  return (
    <Message from={message.role}>
      <MessageContent aria-busy={message.streaming || undefined}>
        {message.role === "assistant" ? (
          <MessageResponse
            mode={message.streaming ? "streaming" : "static"}
            isAnimating={message.streaming}
          >
            {message.markdown}
          </MessageResponse>
        ) : (
          <p className="whitespace-pre-wrap">{message.markdown}</p>
        )}
      </MessageContent>
    </Message>
  );
}
