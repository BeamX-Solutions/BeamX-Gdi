"use client";

import { useEffect, useRef } from "react";
import { billingConfig } from "@/billing/config";
import { coveringPacks } from "@/billing/pricing";
import type {
  AnswerData,
  PrefillResponseData,
  ReportData,
} from "@/assistant/part-schemas";
import { AnswerCard } from "@/components/answer-cards/answer-card";
import { AnsweredBubble } from "@/components/answer-cards/answered-bubble";
import { PrefillCard } from "@/components/answer-cards/prefill-card";
import { ConfirmCard } from "@/components/credits/confirm-card";
import { ShortBalanceCard } from "@/components/credits/short-balance-card";
import { StopCard } from "@/components/credits/stop-card";
import { ErrorCard } from "@/components/feedback/error-card";
import { chatErrorCopy } from "@/components/feedback/error-copy";
import { prefillResponseText, reportTitle } from "./chat-copy";
import type { ThreadItem } from "./chat-view";
import { ViewReportCard } from "./view-report-card";
import { useWorkspace } from "./workspace-context";

/** What a card tap does; the chat turns each into one user message. */
export type ChatActions = {
  readonly answer: (data: AnswerData) => void;
  readonly prefill: (data: PrefillResponseData) => void;
  readonly approve: (approvalId: string, approved: boolean) => void;
  readonly retryComplete: (runId: string) => void;
  /** Sends the turn again (Retry after an AI error). */
  readonly retryTurn: () => void;
  /** Send again after `busy`: reattaches to the running reply, then resends if needed. */
  readonly retryBusy: (itemId: string) => void;
  readonly openReport: (runId: string) => void;
  /** Hides a notice that was never saved (a limit notice's Got it). */
  readonly dismiss: (itemId: string) => void;
  readonly edit: (itemId: string | null) => void;
};

type ChatItemProps = {
  readonly item: Exclude<ThreadItem, { readonly kind: "text" }>;
  readonly actions: ChatActions;
  /** Cards can't be tapped while a turn is on its way. */
  readonly busy: boolean;
  readonly guest: boolean;
  /** The answer bubble being edited, if any. */
  readonly editing: string | null;
  readonly toolNames: Readonly<Record<string, string>>;
};

/** One card of the thread (spec 0007, "Part renderers"). Renders from props only. */
export function ChatItem({
  item,
  actions,
  busy,
  guest,
  editing,
  toolNames,
}: ChatItemProps) {
  switch (item.kind) {
    case "question": {
      const { data } = item;
      return (
        <div className="flex min-w-0 flex-col gap-2">
          {data.note ? (
            <p className="text-sm text-muted-foreground">{data.note}</p>
          ) : null}
          <AnswerCard
            key={item.id}
            question={data.view}
            progress={data.progress}
            disabled={busy}
            onSubmit={(value) =>
              actions.answer({
                runId: data.runId,
                questionId: data.questionId,
                value,
              })
            }
          />
        </div>
      );
    }
    case "answer": {
      const { question } = item;
      return editing === item.id ? (
        <AnswerCard
          question={item.view}
          progress={question.progress}
          initialValue={item.value}
          disabled={busy}
          onSubmit={(value) => {
            actions.edit(null);
            actions.answer({
              runId: question.runId,
              questionId: question.questionId,
              value,
            });
          }}
        />
      ) : (
        <AnsweredBubble
          question={item.view}
          value={item.value}
          editable={item.editable && !busy}
          onEdit={() => actions.edit(item.id)}
        />
      );
    }
    case "prefill": {
      const { data } = item;
      const ids = data.items.map((i) => i.questionId);
      return (
        <PrefillCard
          title={data.title}
          items={data.items}
          disabled={busy}
          onAcceptAll={() =>
            actions.prefill({ runId: data.runId, accept: ids, edit: null })
          }
          onEdit={(questionId) =>
            actions.prefill({
              runId: data.runId,
              accept: ids.filter((id) => id !== questionId),
              edit: questionId,
            })
          }
        />
      );
    }
    case "prefill-response":
      return (
        <p className="max-w-[85%] self-end rounded-xl bg-primary px-4 py-2.5 text-base wrap-anywhere text-primary-foreground">
          {prefillResponseText(item.accepted, item.editPrompt)}
        </p>
      );
    case "report":
      return <ReportCard data={item.data} onOpen={actions.openReport} />;
    case "error": {
      const { data } = item;
      const copy = chatErrorCopy[data.kind];
      const runId = data.runId;
      return (
        <ErrorCard
          kind="ai_error"
          title={copy.title}
          message={copy.message}
          action={{
            label: copy.actionLabel,
            onAction:
              data.kind === "limit_text" || data.kind === "limit_run"
                ? () => actions.dismiss(item.id)
                : data.kind === "complete_retry" && runId !== undefined
                  ? () => actions.retryComplete(runId)
                  : data.kind === "busy"
                    ? () => actions.retryBusy(item.id)
                    : actions.retryTurn,
          }}
        />
      );
    }
    case "confirm":
      return (
        <ConfirmCard
          tool={item.tool}
          toolName={
            item.toolId === null ? null : (toolNames[item.toolId] ?? null)
          }
          price={item.price}
          available={item.available}
          state={item.state === "expired" ? "declined" : item.state}
          disabled={busy}
          onApprove={() => actions.approve(item.approvalId, true)}
          onDecline={() => actions.approve(item.approvalId, false)}
        />
      );
    case "stop":
      return (
        <StopCard
          heldAmount={item.heldAmount}
          state={item.state === "expired" ? "declined" : item.state}
          disabled={busy}
          onApprove={() => actions.approve(item.approvalId, true)}
          onDecline={() => actions.approve(item.approvalId, false)}
        />
      );
    case "short":
      return (
        <ShortBalanceCard
          shortfall={item.shortfall}
          guest={guest}
          packs={coveringPacks(billingConfig.packs, item.shortfall)}
        />
      );
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
}

/** The view report card: selects the report and, on phones, opens the sheet. */
function ReportCard({
  data,
  onOpen,
}: {
  readonly data: ReportData;
  readonly onOpen: (runId: string) => void;
}) {
  const workspace = useWorkspace();
  return (
    <ViewReportCard
      title={reportTitle(data.toolName)}
      onOpen={() => {
        onOpen(data.runId);
        workspace?.openReport();
      }}
    />
  );
}

/**
 * Opens the report sheet on phones when a new report arrives in this visit (spec 0007,
 * AC-4). A report already there when the page loaded stays behind its card.
 */
export function OpenReportOnArrival({
  runId,
}: {
  readonly runId: string | null;
}) {
  const workspace = useWorkspace();
  const seen = useRef(runId);
  useEffect(() => {
    if (runId === null || runId === seen.current) return;
    seen.current = runId;
    workspace?.openReport();
  }, [runId, workspace]);
  return null;
}
