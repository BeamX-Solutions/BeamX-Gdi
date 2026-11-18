import { CheckIcon, CircleIcon, Loader2Icon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SkeletonStep, SkeletonStepState } from "./types";

const stateText: Readonly<Record<SkeletonStepState, string>> = {
  done: "Done",
  active: "In progress",
  pending: "Waiting",
};

function StepIcon({ state }: { readonly state: SkeletonStepState }) {
  switch (state) {
    case "done":
      return <CheckIcon className="size-4 text-primary" aria-hidden />;
    case "active":
      return (
        <Loader2Icon className="size-4 animate-spin text-primary" aria-hidden />
      );
    case "pending":
      return (
        <CircleIcon className="size-4 text-muted-foreground" aria-hidden />
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

/**
 * Shown while a report is being written: placeholder blocks plus the named steps. Each step
 * shows an icon and its state as text, so progress never depends on color.
 */
export function ReportSkeleton({
  steps,
}: {
  readonly steps: readonly SkeletonStep[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="report-skeleton">
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <ol aria-label="Report steps" className="flex flex-col gap-2">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex min-h-8 min-w-0 items-center gap-3 text-sm"
          >
            <StepIcon state={step.state} />
            <span
              className={cn(
                "min-w-0 flex-1 wrap-anywhere",
                step.state === "pending" && "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {stateText[step.state]}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
