"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ReportPanel } from "./report-panel";
import { ReportSheet } from "./report-sheet";
import { useIsDesktop, useIsWide } from "./use-is-desktop";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from "./workspace-context";

type WorkspaceShellProps = {
  readonly header: ReactNode;
  readonly rail: ReactNode;
  /** The report. Null means no panel and no sheet. */
  readonly report: ReactNode | null;
  readonly reportTitle?: string;
  /** The run progress bar, pinned under the header. */
  readonly progress?: ReactNode;
  /** The Thread and the Composer. */
  readonly children: ReactNode;
};

/**
 * The workspace layout. It renders exactly one layout tree, picked by `useIsDesktop`:
 * desktop is a history rail, the chat column, and a resizable report panel; phones get one
 * column, a history drawer, and the report in a full screen sheet.
 */
export function WorkspaceShell({
  header,
  rail,
  report,
  reportTitle = "Report",
  progress,
  children,
}: WorkspaceShellProps) {
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
  const hasReport = report !== null;

  // The rail follows the user's last choice; until they choose, it collapses on its own
  // below 1280px while a report panel is open. Nothing is saved between visits.
  const [railChoice, setRailChoice] = useState<boolean | null>(null);
  const railCollapsed = railChoice ?? (hasReport && !isWide);

  const [historyOpenRaw, setHistoryOpen] = useState(false);
  const [sheetOpenRaw, setSheetOpen] = useState(false);
  // Crossing to desktop closes the drawer and the sheet (the panel shows instead).
  const historyOpen = historyOpenRaw && !isDesktop;
  const sheetOpen = sheetOpenRaw && !isDesktop && hasReport;

  const reportCardRef = useRef<HTMLButtonElement | null>(null);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      isDesktop,
      railCollapsed,
      toggleRail: () => setRailChoice(!railCollapsed),
      historyOpen,
      setHistoryOpen,
      openReport: () => setSheetOpen(true),
      reportCardRef,
    }),
    [isDesktop, railCollapsed, historyOpen],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
        {header}
        {progress}
        <div className="flex min-h-0 min-w-0 flex-1">
          {isDesktop ? rail : null}
          {isDesktop ? (
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-w-0 flex-1"
            >
              <ResizablePanel id="chat" minSize={360}>
                <ChatColumn>{children}</ChatColumn>
              </ResizablePanel>
              {hasReport ? (
                <>
                  <ResizableHandle aria-label="Resize report panel" />
                  <ResizablePanel
                    id="report"
                    defaultSize="45%"
                    minSize={360}
                    maxSize="60%"
                  >
                    <ReportPanel title={reportTitle}>{report}</ReportPanel>
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          ) : (
            <ChatColumn>{children}</ChatColumn>
          )}
        </div>
        {isDesktop ? null : (
          <>
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetContent side="left" className="w-72 gap-0 p-0">
                <SheetTitle className="sr-only">Chat history</SheetTitle>
                <SheetDescription className="sr-only">
                  Your recent chats.
                </SheetDescription>
                {rail}
              </SheetContent>
            </Sheet>
            {hasReport ? (
              <ReportSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                title={reportTitle}
              >
                {report}
              </ReportSheet>
            ) : null}
          </>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}

/** The chat column: centered, 48rem at most, never wider than its space. */
function ChatColumn({ children }: { readonly children: ReactNode }) {
  return (
    <main
      className={cn(
        "mx-auto flex h-full min-h-0 w-full max-w-3xl min-w-0 flex-1 flex-col",
      )}
    >
      {children}
    </main>
  );
}
