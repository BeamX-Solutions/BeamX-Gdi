import { cn } from "@/lib/utils";

type ShimmerProps = {
  readonly children: string;
  readonly className?: string;
};

/**
 * Text with a moving highlight, for "working" status lines. Restyled from AI Elements
 * `shimmer`: pure CSS (`.shimmer` in globals.css) instead of a script animation library,
 * so the one reduced motion rule turns it off (AC-14). The text keeps its real color
 * (`--muted-foreground`), so contrast checks see readable text.
 */
export function Shimmer({ children, className }: ShimmerProps) {
  return <span className={cn("shimmer", className)}>{children}</span>;
}
