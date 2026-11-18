import { cn } from "@/lib/utils";
import { barFraction, barText } from "./bar-math";
import type { CategoryBarItem } from "./types";
import { verdictStyle } from "./verdict";

/**
 * Labeled bars drawn in HTML and CSS (no chart library). Each bar also shows its value as
 * text, so the width is never the only way to read it.
 */
export function CategoryBars({
  items,
  label,
}: {
  readonly items: readonly CategoryBarItem[];
  /** Names the list for screen readers. */
  readonly label?: string;
}) {
  return (
    <ul
      aria-label={label ?? "Scores by category"}
      className="flex flex-col gap-4"
    >
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 font-medium wrap-anywhere">
              {item.label}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {barText(item.score, item.max)}
            </span>
          </div>
          <div
            aria-hidden
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full",
                item.verdict ? verdictStyle[item.verdict].fill : "bg-primary",
              )}
              style={{ width: `${barFraction(item.score, item.max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
