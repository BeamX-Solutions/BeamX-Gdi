import { ErrorCard } from "@/components/feedback/error-card";
import { errorCopy } from "@/components/feedback/error-copy";
import { START_AGAIN_LABEL, type PanelView } from "./report-panel-state";
import { ReportSkeleton } from "./report-skeleton";
import { ReportView } from "./report-view";

type ReportStatusViewProps = {
  readonly view: PanelView;
  /** POSTs the report again. */
  readonly onRetry: () => void;
  /** The one action when no retry is possible (credits returned, tool updated, unreadable). */
  readonly onStartAgain: () => void;
};

/**
 * The four report panel states (spec 0005, AC-11) from a `PanelView`: the skeleton with
 * one step per phase, an error card with Retry, an error card with Start again, or the
 * report. Renders from props only, so `/design` shows every state on fixtures.
 */
export function ReportStatusView(props: ReportStatusViewProps) {
  const { view } = props;
  const preview = view.kind === "ready" ? undefined : view.preview;
  if (!preview || preview.length === 0) return <StatusBody {...props} />;
  // The scores a tool can show before its report is ready, above the steps (spec 0011).
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <ReportView blocks={preview} testId="report-preview" />
      <StatusBody {...props} />
    </div>
  );
}

function StatusBody({ view, onRetry, onStartAgain }: ReportStatusViewProps) {
  switch (view.kind) {
    case "generating":
      return <ReportSkeleton steps={view.steps} />;
    case "retry":
      return (
        <ErrorCard
          kind={view.cardKind}
          title={view.title}
          message={view.message}
          action={{ label: errorCopy.ai_error.actionLabel, onAction: onRetry }}
        />
      );
    case "final":
      return (
        <ErrorCard
          kind={view.cardKind}
          title={view.title}
          message={view.message}
          action={{ label: START_AGAIN_LABEL, onAction: onStartAgain }}
        />
      );
    case "ready":
      return <ReportView blocks={view.blocks} />;
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}
