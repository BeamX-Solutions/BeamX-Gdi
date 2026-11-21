"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "./workspace-context";

type ReportSheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
};

/** The report as a full screen sheet on phones. Closes on Escape; focus returns to the "View report" card. */
export function ReportSheet({
  open,
  onOpenChange,
  title,
  children,
}: ReportSheetProps) {
  const workspace = useWorkspace();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-0 h-dvh gap-0 border-0 p-0"
        onCloseAutoFocus={(event) => {
          const card = workspace?.reportCardRef.current;
          if (card) {
            event.preventDefault();
            card.focus();
          }
        }}
      >
        <div className="flex h-14 shrink-0 items-center border-b pr-14 pl-4">
          <SheetTitle className="min-w-0 truncate font-heading">
            {title}
          </SheetTitle>
          <SheetDescription className="sr-only">
            The full report for this chat.
          </SheetDescription>
        </div>
        <ScrollArea className="min-h-0 flex-1" viewportLabel="Report contents">
          <div className="min-w-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
