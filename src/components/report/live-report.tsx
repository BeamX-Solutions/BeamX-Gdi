"use client";

import { panelView } from "./report-panel-state";
import { ReportStatusView } from "./report-status-view";
import { useReportStatus } from "./use-report-status";

/**
 * A run's report, live: polls the report route and draws whichever state it is in.
 * Put it inside a `ReportPanel` or `ReportSheet`. `onStartAgain` is what the chat does
 * when a report can no longer be made (#7 wires it to a new run).
 */
export function LiveReport({
  runId,
  onStartAgain,
}: {
  readonly runId: string;
  readonly onStartAgain: () => void;
}) {
  const { state, retry } = useReportStatus(runId);
  return (
    <ReportStatusView
      view={panelView(state)}
      onRetry={() => void retry()}
      onStartAgain={onStartAgain}
    />
  );
}
