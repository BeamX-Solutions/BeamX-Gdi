"use client";

import { useState, type ReactNode } from "react";
import { ErrorCard, type ErrorKind } from "@/components/feedback/error-card";
import { errorCopy } from "@/components/feedback/error-copy";
import {
  adviceItems,
  errorKinds,
  plainBars,
  reportFixtures,
  sectionMarkdown,
  skeletonAllDone,
  skeletonSteps,
  streamingSectionMarkdown,
} from "@/components/fixtures/report";
import { openingMessages } from "@/components/fixtures/chat";
import { AdviceList } from "@/components/report/advice-list";
import { CategoryBars } from "@/components/report/category-bars";
import { ReportSection } from "@/components/report/report-section";
import { ReportSkeleton } from "@/components/report/report-skeleton";
import { ScoreHeader } from "@/components/report/score-header";
import type { Verdict } from "@/components/report/types";
import { VerdictBadge } from "@/components/report/verdict-badge";
import { defaultVerdictLabel } from "@/components/report/verdict";
import { ReportPanel } from "./report-panel";
import { Thread } from "./thread";

const verdicts: readonly Verdict[] = ["good", "caution", "risk"];

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

/** One error card for a kind, using the default wording and a demo action. */
function DemoError({ kind }: { readonly kind: ErrorKind }) {
  const copy = errorCopy[kind];
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`gone-${kind}`}>
        Dismissed.
      </p>
    );
  }
  return (
    <ErrorCard
      kind={kind}
      title={copy.title}
      message={copy.message}
      action={
        kind === "limit_reached"
          ? { label: copy.actionLabel, href: "/sign-up" }
          : {
              label: copy.actionLabel,
              onAction:
                kind === "spend_cap"
                  ? () => setDismissed(true)
                  : () => undefined,
            }
      }
    />
  );
}

/** Report parts, skeleton, and error cards on fixture data (spec 0003). */
export function ReportGallery() {
  const [retries, setRetries] = useState(0);
  const [panelState, setPanelState] = useState<"failed" | "generating">(
    "failed",
  );

  return (
    <div className="flex flex-col gap-10">
      <Block title="Score header, one per verdict">
        <div className="grid min-w-0 gap-6 lg:grid-cols-3">
          {verdicts.map((verdict) => {
            const report = reportFixtures[verdict];
            return (
              <div
                key={verdict}
                className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
              >
                <ScoreHeader
                  score={report.score}
                  max={report.max}
                  verdict={report.verdict}
                  verdictLabel={report.verdictLabel}
                  summary={report.summary}
                />
              </div>
            );
          })}
        </div>
        <ul
          className="flex flex-wrap gap-3"
          aria-label="Default verdict wording"
        >
          {verdicts.map((verdict) => (
            <li key={verdict}>
              <VerdictBadge
                verdict={verdict}
                label={defaultVerdictLabel[verdict]}
              />
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Category bars">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
            <CategoryBars
              label="Bars with verdict colors"
              items={reportFixtures.caution.bars}
            />
          </div>
          <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
            <CategoryBars label="Bars without a verdict" items={plainBars} />
          </div>
        </div>
      </Block>

      <Block title="Advice list">
        <AdviceList items={adviceItems} />
      </Block>

      <Block title="Report sections">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <ReportSection title="Finished section" markdown={sectionMarkdown} />
          <ReportSection
            title="Streaming section"
            markdown={streamingSectionMarkdown}
            streaming
          />
        </div>
      </Block>

      <Block title="Report skeleton">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
            <ReportSkeleton steps={skeletonSteps} />
          </div>
          <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground md:p-5">
            <ReportSkeleton steps={skeletonAllDone} />
          </div>
        </div>
      </Block>

      <Block title="Error cards">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {errorKinds.map((kind) => (
            <DemoError key={kind} kind={kind} />
          ))}
        </div>
      </Block>

      <Block title="Error card in the thread">
        <div className="flex h-72 min-w-0 flex-col overflow-hidden rounded-xl border bg-background">
          <Thread
            label="Thread with an error"
            messages={openingMessages}
            status={null}
          >
            <DemoError kind="network" />
          </Thread>
        </div>
      </Block>

      <Block title="Failed report in the panel">
        <div
          data-testid="report-panel-demo"
          className="h-96 min-w-0 overflow-hidden rounded-xl border"
        >
          <ReportPanel title="Idea check report">
            {panelState === "failed" ? (
              <ErrorCard
                kind="ai_error"
                title="We could not write your report"
                message="Your answers are safe. Try again and we will pick up where we stopped."
                action={{
                  label: "Retry",
                  onAction: () => {
                    setRetries((count) => count + 1);
                    setPanelState("generating");
                  },
                }}
              />
            ) : (
              <ReportSkeleton steps={skeletonSteps} />
            )}
          </ReportPanel>
        </div>
        <p className="text-sm text-muted-foreground">Retries: {retries}</p>
      </Block>
    </div>
  );
}
