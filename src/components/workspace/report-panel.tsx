import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

/** The report beside the chat on desktop. The shell puts it in a resizable panel. */
export function ReportPanel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex h-full min-w-0 flex-col bg-card text-card-foreground"
    >
      <h2 className="shrink-0 border-b px-4 py-3 text-base font-semibold wrap-anywhere">
        {title}
      </h2>
      <ScrollArea className="min-h-0 flex-1" viewportLabel="Report contents">
        <div className="min-w-0 p-4 md:p-5">{children}</div>
      </ScrollArea>
    </section>
  );
}
