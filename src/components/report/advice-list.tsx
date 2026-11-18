import { Badge } from "@/components/ui/badge";
import type { AdviceItem, AdvicePriority } from "./types";

const priorityTag: Readonly<
  Record<AdvicePriority, { label: string; variant: "default" | "outline" }>
> = {
  high: { label: "High priority", variant: "default" },
  medium: { label: "Medium priority", variant: "outline" },
  low: { label: "Low priority", variant: "outline" },
};

/** Advice with a priority tag. The tags are neutral, never verdict colors. */
export function AdviceList({
  items,
  label,
}: {
  readonly items: readonly AdviceItem[];
  readonly label?: string;
}) {
  return (
    <ol aria-label={label ?? "Advice"} className="flex flex-col gap-3">
      {items.map((item) => {
        const tag = priorityTag[item.priority];
        return (
          <li
            key={item.title}
            className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tag.variant}>{tag.label}</Badge>
              <p className="min-w-0 font-medium wrap-anywhere">{item.title}</p>
            </div>
            {item.detail ? (
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {item.detail}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
