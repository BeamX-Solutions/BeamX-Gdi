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
import type { AnswerData, PrefillResponseData } from "@/assistant/part-schemas";
import { authClient } from "@/auth/client";
import type { CreditSummary } from "@/billing/summary";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { LiveCreditSummary } from "@/components/credits/credit-chip";
import { ErrorCard } from "@/components/feedback/error-card";
import { panelView } from "@/components/report/report-panel-state";
import { ReportStatusView } from "@/components/report/report-status-view";
import { useReportStatus } from "@/components/report/use-report-status";
import { reportTitle } from "./chat-copy";
import { ChatItem, OpenReportOnArrival, type ChatActions } from "./chat-items";
import {
  chatRequestBody,
  failureCopy,
  failureOf,
  type ChatFailure,
} from "./chat-request";
import {
  latestReport,
  latestToolSummary,
  threadItems,
  withoutMessageOf,
  type ThreadItem,
  type ViewMessage,
} from "./chat-view";
import { Composer } from "./composer";
import { Header } from "./header";
import { HistoryRail } from "./history-rail";
import { Thread } from "./thread";
import type { MessageView, ThreadEntry } from "./types";
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
  /** The header credit chip, seeded on the server (spec 0007, AC-9). */
  readonly chip?: ReactNode;
  /** Tool names by id, from the registry, for the confirm card ("Start Stellar?"). */
  readonly toolNames?: Readonly<Record<string, string>>;
};

/** The shell, the thread area and the composer: one layout for every chat state. */
function ChatFrame({
  thread,
  composer,
  chip,
  report = null,
  reportName,
}: {
  readonly thread: ReactNode;
  readonly composer: ReactNode;
  readonly chip?: ReactNode;
  readonly report?: ReactNode | null;
  readonly reportName?: string;
}) {
  return (
    <WorkspaceShell
      header={<Header>{chip}</Header>}
      rail={<HistoryRail items={[]} />}
      report={report}
      reportTitle={reportName}
    >
      {thread}
      {composer}
    </WorkspaceShell>
  );
}

/** The frame before the chat can run: static, so it prerenders; composer off. */
function ChatPlaceholder({ chip }: { readonly chip?: ReactNode }) {
  return (
    <ChatFrame
      chip={chip}
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
export function Chat({
  conversationId,
  initialMessages,
  loading,
  chip,
  toolNames = {},
}: ChatProps) {
  const freshId = useBrowserId();
  const id = conversationId ?? freshId;
  return id === null || loading ? (
    <ChatPlaceholder chip={chip} />
  ) : (
    <LiveChat
      id={id}
      initialMessages={initialMessages ?? []}
      chip={chip}
      toolNames={toolNames}
    />
  );
}

/** The thread's message bubbles, for the live region's announcements. */
const messageViews = (items: readonly ThreadItem[]): readonly MessageView[] =>
  items.flatMap((i) =>
    i.kind === "text"
      ? [
          {
            id: i.id,
            role: i.role,
            markdown: i.markdown,
            streaming: i.streaming,
          },
        ]
      : [],
  );

const sameSummary = (a: CreditSummary | null, b: CreditSummary | null) =>
  a?.available === b?.available && a?.held === b?.held;

/** The parts a card tap sends, as `useChat` takes them. */
type UserParts = ChatUIMessage["parts"];

/**
 * The running chat. The first send signs a guest in anonymously when there is no
 * session, then sends; the URL becomes `/c/[id]` once the first response headers
 * arrive. Only the new message is sent each time, and every card tap is one message.
 */
function LiveChat({
  id,
  initialMessages,
  chip,
  toolNames,
}: {
  readonly id: string;
  readonly initialMessages: readonly ChatUIMessage[];
  readonly chip?: ReactNode;
  readonly toolNames: Readonly<Record<string, string>>;
}) {
  const session = authClient.useSession();
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
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

  const {
    messages,
    sendMessage,
    regenerate,
    setMessages,
    status,
    error,
    clearError,
  } = useChat<ChatUIMessage>({
    id,
    messages: [...initialMessages],
    generateId: newId,
    // A saved chat may have a reply still streaming: reconnect to it on load (AC-6).
    // A new chat has nothing to resume, so it makes no request.
    resume: initialMessages.length > 0,
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
        // The auth client returns `{ error }` for a server reply but throws when the
        // request never lands (offline, DNS, aborted), so both end in the same card.
        const signed = await authClient.signIn
          .anonymous()
          .catch(() => ({ error: true }) as const);
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

  /** One card tap as one user message. Cards only show once a session exists. */
  const tap = (parts: UserParts) => {
    if (busy || inFlight.current) return;
    setFailure(null);
    clearError();
    void sendMessage({ parts });
  };

  const actions: ChatActions = {
    answer: (data: AnswerData) => tap([{ type: "data-answer", data }]),
    prefill: (data: PrefillResponseData) =>
      tap([{ type: "data-prefill-response", data }]),
    // Spec 0006: an approval tap is its own user message, in the AI SDK's
    // `tool-approval-response` shape, which `useChat`'s part types don't list.
    approve: (approvalId, approved) =>
      tap([
        { type: "tool-approval-response", approvalId, approved },
      ] as unknown as UserParts),
    retryComplete: (runId) =>
      tap([{ type: "data-retry", data: { runId, action: "complete" } }]),
    retryTurn: () => {
      if (busy) return;
      setFailure(null);
      clearError();
      void regenerate();
    },
    openReport: setSelectedRun,
    dismiss: (itemId) => setMessages((ms) => withoutMessageOf(ms, itemId)),
    edit: setEditing,
  };

  const viewMessages = messages as readonly ViewMessage[];
  const streamingId =
    status === "streaming" ? (messages.at(-1)?.id ?? null) : null;
  const items = threadItems(viewMessages, streamingId);
  const latest = latestReport(items);
  const shown =
    items.flatMap((i) =>
      i.kind === "report" && i.data.runId === selectedRun ? [i.data] : [],
    )[0] ?? latest;
  const report = useReportStatus(shown?.runId ?? null);

  // The chip's live value (AC-9): the newest of a money tool's summary and the report
  // poll's. A summary already in the saved thread is older than the server seed, so it
  // is skipped.
  const toolSummary = latestToolSummary(viewMessages);
  const polled =
    report.state.kind === "loaded"
      ? (report.state.payload.summary ?? null)
      : null;
  const [live, setLive] = useState(() => ({
    toolKey: latestToolSummary(initialMessages as readonly ViewMessage[])?.key,
    polled: null as CreditSummary | null,
    summary: null as CreditSummary | null,
  }));
  if (toolSummary && toolSummary.key !== live.toolKey)
    // The poll seen so far counts as older, so it can't replace this one next render.
    setLive({
      toolKey: toolSummary.key,
      polled: polled ?? live.polled,
      summary: toolSummary.summary,
    });
  else if (polled && !sameSummary(polled, live.polled))
    setLive({ ...live, polled, summary: polled });

  const entries = items.map((item): ThreadEntry =>
    item.kind === "text"
      ? {
          kind: "message",
          message: {
            id: item.id,
            role: item.role,
            markdown: item.markdown,
            streaming: item.streaming,
          },
        }
      : {
          kind: "node",
          id: item.id,
          node: (
            <ChatItem
              item={item}
              actions={actions}
              busy={busy}
              guest={session.data?.user.isAnonymous ?? true}
              editing={editing}
              toolNames={toolNames}
            />
          ),
        },
  );
  const cardOpen = items.some(
    (i) => i.kind === "question" || i.kind === "prefill",
  );

  const shownFailure = failure ?? (error ? failureOf(error) : null);
  const copy = shownFailure === null ? null : failureCopy[shownFailure];

  return (
    <LiveCreditSummary.Provider value={live.summary}>
      <ChatFrame
        chip={chip}
        reportName={shown ? reportTitle(shown.toolName) : undefined}
        report={
          shown ? (
            <ReportStatusView
              view={panelView(report.state)}
              onRetry={() => void report.retry()}
              onStartAgain={() =>
                void send(`I'd like to start ${shown.toolName} again`)
              }
            />
          ) : null
        }
        thread={
          <Thread
            messages={messageViews(items)}
            entries={entries}
            status={status === "submitted" ? "Thinking…" : null}
            label="Chat with BeamX"
          >
            <OpenReportOnArrival runId={latest?.runId ?? null} />
            {items.length === 0 ? (
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
                  shownFailure === "not_found"
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
        composer={
          <Composer
            hint={cardOpen ? "Or type your answer" : undefined}
            onSend={(text) => void send(text)}
            disabled={busy}
          />
        }
      />
    </LiveCreditSummary.Provider>
  );
}
