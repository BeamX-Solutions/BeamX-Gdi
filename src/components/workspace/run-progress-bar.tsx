import { PauseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type RunProgressBarProps = {
  readonly toolName: string;
  readonly done: number;
  readonly total: number;
  readonly onPause: () => void;
};

/**
 * Pinned under the header while a run is active: tool name, "{done} of {total} questions",
 * a thin bar, and Pause (AC-10). The caller hides it when no run is active. Pause only;
 * Luna adds Resume later.
 */
export function RunProgressBar({
  toolName,
  done,
  total,
  onPause,
}: RunProgressBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-background px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-medium">{toolName}</span>
          <span className="shrink-0 text-muted-foreground">
            {done} of {total} questions
          </span>
        </div>
        <Progress
          value={done}
          max={total}
          aria-label={`${toolName} progress`}
          aria-valuetext={`${done} of ${total} questions`}
        />
      </div>
      <Button type="button" variant="outline" onClick={onPause}>
        <PauseIcon aria-hidden />
        Pause
      </Button>
    </div>
  );
}
