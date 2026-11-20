"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { v7 as newId } from "uuid";
import type { ChatUIMessage } from "@/assistant/chat-page";
import { authClient } from "@/auth/client";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { ErrorCard } from "@/components/feedback/error-card";
import {
  chatRequestBody,
  failureCopy,
  failureOf,
  type ChatFailure,
} from "./chat-request";
import { Composer } from "./composer";
import { Header } from "./header";
import { HistoryRail } from "./history-rail";
import { Thread } from "./thread";
import type { MessageView } from "./types";
import { WorkspaceShell } from "./workspace-shell";

export const STARTER_PROMPTS = [
  "I have a business idea",
  "What can BeamX do?",
] as const;

type ChatProps = {
  /** The chat's id on `/c/[id]`; on `/` a fresh one is made, used from the first send. */
  readonly conversationId?: string;
  readonly initialMessages?: readonly ChatUIMessage[];
  /** The page is still loading the saved chat: show the shell, composer off. */
  readonly loading?: boolean;
};

/** The typed text of each message, for the Thread (cards come with milestone 2). */
const toViews = (
  messages: readonly ChatUIMessage[],
  streamingId: string | null,
): readonly MessageView[] =>
  messages.flatMap((m) => {
    const markdown = m.parts
      .flatMap((p) => (p.type === "text" ? [p.text] : []))
      .join("\n\n");
    return markdown.length === 0 && m.id !== streamingId
      ? []
      : [
          {
            id: m.id,
            role: m.role === "user" ? "user" : "assistant",
            markdown,
            streaming: m.id === streamingId,
          },
        ];
  });

/** The shell, the thread area and the composer: one layout for every chat state. */
function ChatFrame({
  thread,
  composer,
}: {
  readonly thread: ReactNode;
  readonly composer: ReactNode;
}) {
  return (
    <WorkspaceShell
      header={<Header />}
      rail={<HistoryRail items={[]} />}
      report={null}
    >
      {thread}
      {composer}
    </WorkspaceShell>
  );
}

/** The frame before the chat can run: static, so it prerenders; composer off. */
function ChatPlaceholder() {
  return (
    <ChatFrame
      thread={<Thread messages={[]} status={null} label="Chat with BeamX" />}
      composer={<Composer onSend={() => {}} disabled />}
    />
  );
}

const noSubscribe = () => () => {};

/**
 * A new chat id, made only in the browser: null during prerender and hydration, then a
 * UUID v7 that stays the same for this mount.
 */
function useBrowserId(): string | null {
  const id = useRef<string | null>(null);
  return useSyncExternalStore(
    noSubscribe,
    () => (id.current ??= newId()),
    () => null,
  );
}

/**
 * The chat screen on `/` and `/c/[id]` (spec 0007, AC-1, AC-5). On `/` the chat id is
 * made in the browser (a UUID v7 reads the clock, so it can't be made at prerender);
 * until then, and while `/c/[id]` loads, the static frame shows with the composer off.
 */
export function Chat({ conversationId, initialMessages, loading }: ChatProps) {
  const freshId = useBrowserId();
  const id = conversationId ?? freshId;
  return id === null || loading ? (
    <ChatPlaceholder />
  ) : (
    <LiveChat id={id} initialMessages={initialMessages ?? []} />
  );
}

/**
 * The running chat. The first send signs a guest in anonymously when there is no
 * session, then sends; the URL becomes `/c/[id]` once the first response headers
 * arrive. Only the new message is sent each time.
 */
function LiveChat({
  id,
  initialMessages,
}: {
  readonly id: string;
  readonly initialMessages: readonly ChatUIMessage[];
}) {
  const session = authClient.useSession();
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  // Stops a second send from creating a second guest while the first sign in runs.
  const inFlight = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: chatRequestBody(id, messages),
        }),
        prepareReconnectToStreamRequest: () => ({
          api: `/api/chat/${id}/stream`,
        }),
        fetch: async (input, init) => {
          const first = await fetch(input, init);
          // The session expired between sends: sign in again and retry once.
          const response =
            first.status === 401 && !(await authClient.signIn.anonymous()).error
              ? await fetch(input, init)
              : first;
          if (response.ok && window.location.pathname !== `/c/${id}`)
            window.history.replaceState(null, "", `/c/${id}`);
          return response;
        },
      }),
    [id],
  );

  const { messages, sendMessage, status, error, clearError } =
    useChat<ChatUIMessage>({
      id,
      messages: [...initialMessages],
      generateId: newId,
      transport,
      onError: (e) => setFailure(failureOf(e)),
    });

  const busy =
    session.isPending ||
    signingIn ||
    status === "submitted" ||
    status === "streaming";

  const send = async (text: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    clearError();
    try {
      if (!session.data) {
        setSigningIn(true);
        const signed = await authClient.signIn.anonymous();
        setSigningIn(false);
        if (signed.error) {
          setFailure("sign_in");
          return;
        }
      }
      await sendMessage({ text });
    } finally {
      setSigningIn(false);
      inFlight.current = false;
    }
  };

  const streamingId =
    status === "streaming" ? (messages.at(-1)?.id ?? null) : null;
  const views = toViews(messages, streamingId);
  const shown = failure ?? (error ? failureOf(error) : null);
  const copy = shown === null ? null : failureCopy[shown];

  return (
    <ChatFrame
      thread={
        <Thread
          messages={views}
          status={status === "submitted" ? "Thinking…" : null}
          label="Chat with BeamX"
        >
          {views.length === 0 ? (
            <Suggestions aria-label="Ways to start">
              {STARTER_PROMPTS.map((prompt) => (
                <Suggestion
                  key={prompt}
                  suggestion={prompt}
                  disabled={busy}
                  onClick={(text) => void send(text)}
                />
              ))}
            </Suggestions>
          ) : null}
          {copy ? (
            <ErrorCard
              kind={copy.kind}
              title={copy.title}
              message={copy.message}
              action={
                shown === "not_found"
                  ? { label: copy.actionLabel, href: "/" }
                  : {
                      label: copy.actionLabel,
                      onAction: () => {
                        setFailure(null);
                        clearError();
                      },
                    }
              }
            />
          ) : null}
        </Thread>
      }
      composer={<Composer onSend={(text) => void send(text)} disabled={busy} />}
    />
  );
}
