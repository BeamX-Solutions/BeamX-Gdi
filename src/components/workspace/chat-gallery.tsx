"use client";

import { useRef, useState, type ReactNode } from "react";
import { billingConfig } from "@/billing/config";
import { coveringPacks } from "@/billing/pricing";
import { PrefillCard } from "@/components/answer-cards/prefill-card";
import { ConfirmCard } from "@/components/credits/confirm-card";
import { CreditChip } from "@/components/credits/credit-chip";
import { SIGN_UP_LABEL } from "@/components/auth/auth-copy";
import { SavePromptCard } from "@/components/auth/save-prompt-card";
import { ShortBalanceCard } from "@/components/credits/short-balance-card";
import { StopCard } from "@/components/credits/stop-card";
import { ErrorCard } from "@/components/feedback/error-card";
import {
  chatErrorCopy,
  type ChatErrorKind,
} from "@/components/feedback/error-copy";
import { Button } from "@/components/ui/button";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  budgetQuestion,
  channelsQuestion,
  confidenceQuestion,
  descriptionQuestion,
  longScaleQuestion,
  longUrlMessage,
  lunaProgress,
  openingMessages,
  plainProgress,
  sectorQuestion,
  staffQuestion,
  streamedReply,
} from "@/components/fixtures/chat";
import { failureCopy } from "./chat-request";
import { Composer, type ComposerHandle } from "./composer";
import { QuestionDemo } from "./question-demo";
import { RunProgressBar } from "./run-progress-bar";
import { StatusLine } from "./status-line";
import { Thread } from "./thread";
import type { MessageView } from "./types";

function Block({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/**
 * The limit notices the chat can show (spec 0008, "Friendly notices"), and the paid
 * chat ones (spec 0004, AC-9, AC-10).
 */
const limitNoticeKinds: readonly ChatErrorKind[] = [
  "slow_down",
  "chat_daily",
  "chats_daily",
  "runs_daily",
  "spend_cap",
  "chat_credits",
  "chat_credits_guest",
  "free_chat_used",
];

/** One limit notice; Got it dismisses it, as in the live chat. */
function LimitNotice({
  id,
  title,
  message,
  actionLabel,
}: {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  return dismissed ? (
    <p className="text-sm text-muted-foreground" data-testid={`gone-${id}`}>
      Dismissed.
    </p>
  ) : (
    <div data-testid={`notice-${id}`}>
      <ErrorCard
        kind="spend_cap"
        title={title}
        message={message}
        action={{ label: actionLabel, onAction: () => setDismissed(true) }}
      />
    </div>
  );
}

/** Chat thread, composer, answer cards, and run progress, on fixture data (spec 0003). */
export function ChatGallery() {
  const composerRef = useRef<ComposerHandle | null>(null);
  const [sent, setSent] = useState<readonly MessageView[]>([]);
  const [paused, setPaused] = useState(false);
  const [streamText, setStreamText] = useState<MessageView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  function streamReply() {
    if (timer.current !== null) window.clearInterval(timer.current);
    const id = `stream-${Date.now()}`;
    let shown = 0;
    setStatus("Writing your reply…");
    setStreamText({ id, role: "assistant", markdown: "", streaming: true });
    timer.current = window.setInterval(() => {
      shown = Math.min(shown + 8, streamedReply.length);
      const done = shown >= streamedReply.length;
      setStreamText({
        id,
        role: "assistant",
        markdown: streamedReply.slice(0, shown),
        streaming: !done,
      });
      if (done) {
        setStatus(null);
        if (timer.current !== null) window.clearInterval(timer.current);
      }
    }, 40);
  }

  return (
    <div className="flex flex-col gap-10">
      <Block title="Live conversation">
        <p className="text-muted-foreground">
          Answer the card, press Edit to change it, or type in the composer.
        </p>
        <div
          data-testid="live-conversation"
          className="flex h-[34rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-background"
        >
          <RunProgressBar
            toolName="Idea Check"
            done={paused ? 3 : 2}
            total={12}
            onPause={() => setPaused(true)}
          />
          <Thread
            label="Live conversation thread"
            messages={[...openingMessages, ...sent]}
            status={null}
          >
            <QuestionDemo
              question={sectorQuestion}
              progress={plainProgress}
              onAnswered={() => composerRef.current?.focus()}
            />
          </Thread>
          <Composer
            ref={composerRef}
            hint="Or type your answer"
            onSend={(text) =>
              setSent((list) => [
                ...list,
                {
                  id: `u-${list.length}`,
                  role: "user",
                  markdown: text,
                  streaming: false,
                },
              ])
            }
          />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="off">
          Paused: {paused ? "yes" : "no"}
        </p>
      </Block>

      <Block title="Streaming reply and live region">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={streamReply}>Stream a reply</Button>
          <Suggestions>
            <Suggestion suggestion="How healthy is my business?" />
            <Suggestion suggestion="I have a business idea" />
          </Suggestions>
        </div>
        <div
          data-testid="stream-thread"
          className="flex h-52 min-w-0 flex-col overflow-hidden rounded-xl border bg-background"
        >
          <Thread
            label="Streaming thread"
            messages={[longUrlMessage, ...(streamText ? [streamText] : [])]}
            status={status}
          />
        </div>
      </Block>

      <Block title="Answer cards">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <QuestionDemo question={channelsQuestion} progress={lunaProgress} />
          <QuestionDemo question={confidenceQuestion} />
          <QuestionDemo question={longScaleQuestion} />
          <QuestionDemo question={descriptionQuestion} />
          <QuestionDemo question={staffQuestion} />
          <QuestionDemo question={budgetQuestion} />
        </div>
      </Block>

      <Block title="Answered bubble, locked">
        <QuestionDemo
          question={{ ...sectorQuestion, id: "locked" }}
          editable={false}
        />
      </Block>

      <Block title="Run progress bar">
        <div className="flex flex-col gap-3 overflow-hidden rounded-xl border">
          <RunProgressBar
            toolName="Luna: full marketing plan"
            done={17}
            total={48}
            onPause={() => undefined}
          />
          <RunProgressBar
            toolName="Idea Check"
            done={0}
            total={12}
            onPause={() => undefined}
          />
        </div>
      </Block>

      <Block title="Credit and prefill cards">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <ConfirmCard
            tool="startRun"
            toolName="Stellar"
            price={30}
            available={30}
            state="pending"
            onApprove={() => undefined}
            onDecline={() => undefined}
          />
          <ConfirmCard
            tool="startRun"
            toolName="Stellar"
            price={30}
            available={30}
            state="approved"
            onApprove={() => undefined}
            onDecline={() => undefined}
          />
          <StopCard
            heldAmount={30}
            state="pending"
            onApprove={() => undefined}
            onDecline={() => undefined}
          />
          <StopCard
            heldAmount={0}
            state="declined"
            onApprove={() => undefined}
            onDecline={() => undefined}
          />
          <ShortBalanceCard shortfall={30} guest packs={[]} />
          <ShortBalanceCard
            shortfall={30}
            guest={false}
            packs={coveringPacks(billingConfig.packs, 30)}
          />
          <PrefillCard
            title="From our chat"
            items={[
              {
                questionId: "stage",
                prompt: "What stage is your idea at?",
                label: "Just an idea",
              },
              {
                questionId: "customer",
                prompt: "Who is your customer?",
                label: "Small shop owners in Lagos",
              },
            ]}
            onAcceptAll={() => undefined}
            onEdit={() => undefined}
          />
          <div className="flex items-start">
            <CreditChip initial={{ available: 30, held: 0 }} />
          </div>
        </div>
      </Block>

      <Block title="Limit notices">
        <div className="grid gap-4 md:grid-cols-2">
          {limitNoticeKinds.map((kind) => (
            <LimitNotice key={kind} id={kind} {...chatErrorCopy[kind]} />
          ))}
          <LimitNotice id="guest_limit" {...failureCopy.guest_limit} />
        </div>
      </Block>

      <Block title="Sign up prompts">
        <p className="text-sm text-muted-foreground">
          Guests only (spec 0009, AC-1): the save prompt under a ready report, a
          limit notice with Sign up beside Got it, and the guest short balance
          card. Each opens the auth dialog on sign up.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div data-testid="save-prompt-demo">
            <SavePromptCard
              onSignUp={() => undefined}
              onDismiss={() => undefined}
            />
          </div>
          <ErrorCard
            kind="spend_cap"
            title={chatErrorCopy.runs_daily.title}
            message={chatErrorCopy.runs_daily.message}
            action={{ label: SIGN_UP_LABEL, onAction: () => undefined }}
            secondaryAction={{
              label: chatErrorCopy.runs_daily.actionLabel,
              onAction: () => undefined,
            }}
          />
          <ShortBalanceCard
            shortfall={30}
            guest
            packs={[]}
            onSignUp={() => undefined}
          />
        </div>
      </Block>

      <Block title="Status line">
        <div className="rounded-xl border p-4">
          <StatusLine text="Scoring your answers…" />
        </div>
      </Block>
    </div>
  );
}
