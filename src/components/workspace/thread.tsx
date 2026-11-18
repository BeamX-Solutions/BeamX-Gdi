"use client";

import { useState, type ReactNode } from "react";
import { Conversation } from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { nextAnnouncement } from "./announce";
import { StatusLine } from "./status-line";
import type { MessageView } from "./types";

type ThreadProps = {
  readonly messages: readonly MessageView[];
  /** Plain text status while the assistant works; null when idle. */
  readonly status: string | null;
  /** Answer cards, the report card, and error cards, shown after the last message. */
  readonly children?: ReactNode;
  readonly label?: string;
};

/**
 * The conversation. It sticks to the bottom while text streams (a "Jump to latest" button
 * shows if the reader scrolled up) and owns the one `aria-live="polite"` region: a reply
 * is announced once, in full, when it stops streaming, and each new status text is
 * announced too (AC-6).
 */
export function Thread({ messages, status, children, label }: ThreadProps) {
  const [tracked, setTracked] = useState({
    messages,
    status,
    announcement: "",
  });
  if (tracked.messages !== messages || tracked.status !== status) {
    setTracked({
      messages,
      status,
      announcement: nextAnnouncement(tracked, messages, status),
    });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Conversation label={label}>
        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
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
        ))}
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
