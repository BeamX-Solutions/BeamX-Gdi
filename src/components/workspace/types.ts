import type { ReactNode } from "react";

export type MessageView = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly markdown: string;
  readonly streaming: boolean;
};

/** One entry of a thread, in order: a message bubble, or a card between messages. */
export type ThreadEntry =
  | { readonly kind: "message"; readonly message: MessageView }
  | { readonly kind: "node"; readonly id: string; readonly node: ReactNode };
