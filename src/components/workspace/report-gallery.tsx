"use client";

import { useState, type ReactNode } from "react";
import { ErrorCard, type ErrorKind } from "@/components/feedback/error-card";
import { errorCopy } from "@/components/feedback/error-copy";
import {
  adviceItems,
  errorKinds,
  panelPayloads,
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
import {
  panelView,
  type PanelView,
} from "@/components/report/report-panel-state";
import { ReportSkeleton } from "@/components/report/report-skeleton";
import { ReportStatusView } from "@/components/report/report-status-view";
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

/** One report panel state on fixture data (spec 0005, AC-11). */
function PanelDemo({
  testId,
  title,
  view,
  onRetry = () => undefined,
  onStartAgain = () => undefined,
}: {
  readonly testId: string;
  readonly title: string;
  readonly view: PanelView;
  readonly onRetry?: () => void;
  readonly onStartAgain?: () => void;
}) {
  return (
    <div
      data-testid={testId}
      className="h-[28rem] min-w-0 overflow-hidden rounded-xl border"
    >
      <ReportPanel title={title}>
        <ReportStatusView
          view={view}
          onRetry={onRetry}
          onStartAgain={onStartAgain}
        />
      </ReportPanel>
    </div>
  );
}

/** Report parts, skeleton, error cards, and the panel states on fixture data. */
export function ReportGallery() {
  const [retries, setRetries] = useState(0);
  const [startAgain, setStartAgain] = useState(0);

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

      <Block title="Report panel states">
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <PanelDemo
            testId="panel-generating"
            title="Generating"
            view={panelView({
              kind: "loaded",
              payload: panelPayloads.generating,
            })}
          />
          <PanelDemo
            testId="panel-failed"
            title="Failed, can retry"
            view={panelView({
              kind: "loaded",
              payload:
                retries === 0 ? panelPayloads.failed : panelPayloads.generating,
            })}
            onRetry={() => setRetries((count) => count + 1)}
          />
          <PanelDemo
            testId="panel-exhausted"
            title="Failed, credits returned"
            view={panelView({
              kind: "loaded",
              payload: panelPayloads.exhausted,
            })}
            onStartAgain={() => setStartAgain((count) => count + 1)}
          />
          <PanelDemo
            testId="panel-ready"
            title="Ready"
            view={panelView({ kind: "loaded", payload: panelPayloads.ready })}
          />
          <PanelDemo
            testId="panel-generating-beacon"
            title="Generating, Beacon with its score preview"
            view={panelView({
              kind: "loaded",
              payload: panelPayloads.beaconGenerating,
            })}
          />
          <PanelDemo
            testId="panel-ready-beacon-advisory"
            title="Ready, Beacon"
            view={panelView({
              kind: "loaded",
              payload: panelPayloads.beaconAdvisoryReady,
            })}
          />
          <PanelDemo
            testId="panel-ready-beacon"
            title="Ready, Beacon v1 (older report)"
            view={panelView({
              kind: "loaded",
              payload: panelPayloads.beaconReady,
            })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Retries: {retries} · Start again: {startAgain}
        </p>
      </Block>
    </div>
  );
}
