"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileTextIcon,
  OctagonXIcon,
} from "lucide-react";
import type { Verdict } from "@/components/report/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

type ViewReportCardProps = {
  readonly title: string;
  readonly verdict?: Verdict;
  readonly verdictLabel?: string;
  /** Defaults to opening the shell's report sheet. */
  readonly onOpen?: () => void;
};

const verdictStyle = {
  good: {
    Icon: CheckCircle2Icon,
    classes: "bg-verdict-good-muted text-verdict-good-strong",
  },
  caution: {
    Icon: AlertTriangleIcon,
    classes: "bg-verdict-caution-muted text-verdict-caution-strong",
  },
  risk: {
    Icon: OctagonXIcon,
    classes: "bg-verdict-risk-muted text-verdict-risk-strong",
  },
} as const satisfies Record<Verdict, { Icon: unknown; classes: string }>;

/** The card in the thread that opens the report sheet on phones. */
export function ViewReportCard({
  title,
  verdict,
  verdictLabel,
  onOpen,
}: ViewReportCardProps) {
  const workspace = useWorkspace();
  const style = verdict ? verdictStyle[verdict] : null;

  return (
    <button
      ref={workspace?.reportCardRef}
      type="button"
      onClick={onOpen ?? workspace?.openReport}
      className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      <FileTextIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium wrap-anywhere">View report</span>
        <span className="text-sm wrap-anywhere text-muted-foreground">
          {title}
        </span>
      </span>
      {style && verdictLabel ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            style.classes,
          )}
        >
          <style.Icon className="size-3.5" aria-hidden />
          {verdictLabel}
        </span>
      ) : null}
      <ChevronRightIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}
