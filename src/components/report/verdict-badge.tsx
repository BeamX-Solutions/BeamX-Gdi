import { cn } from "@/lib/utils";
import type { Verdict } from "./types";
import { verdictStyle } from "./verdict";

type VerdictBadgeProps = {
  readonly verdict: Verdict;
  /** The tool's own wording, like "Needs work". Always shown, beside the icon. */
  readonly label: string;
  readonly className?: string;
};

/** Icon, text label, and color together: a verdict is never color alone (AC-3). */
export function VerdictBadge({ verdict, label, className }: VerdictBadgeProps) {
  const { Icon, badge } = verdictStyle[verdict];
  return (
    <span
      data-verdict={verdict}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        badge,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
