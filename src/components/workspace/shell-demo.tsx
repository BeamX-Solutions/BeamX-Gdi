"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  historyItems,
  longUrl,
  reportParagraphs,
} from "@/components/fixtures/shell";
import { Header } from "./header";
import { HistoryRail } from "./history-rail";
import { ViewReportCard } from "./view-report-card";
import { WorkspaceShell } from "./workspace-shell";

/** The shell on fixture data, for `/design/shell`. A button toggles the report. */
export function ShellDemo() {
  const [hasReport, setHasReport] = useState(true);

  return (
    <WorkspaceShell
      header={<Header />}
      rail={<HistoryRail items={historyItems} />}
      report={
        hasReport ? (
          <div className="flex flex-col gap-3">
            {reportParagraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        ) : null
      }
      reportTitle="Idea check report"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="min-w-0 self-end rounded-xl bg-primary px-4 py-2 wrap-anywhere text-primary-foreground">
          Here is my idea: {longUrl}
        </p>
        <p className="min-w-0 self-start rounded-xl bg-muted px-4 py-2 wrap-anywhere">
          Thanks. I ran your answers through the idea check.
        </p>
        {hasReport ? (
          <ViewReportCard
            title="Idea check report"
            verdict="caution"
            verdictLabel="Needs work"
          />
        ) : null}
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setHasReport((value) => !value)}
        >
          {hasReport ? "Remove report" : "Show report"}
        </Button>
      </div>
      <div className="shrink-0 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm text-muted-foreground">
        The composer goes here.
      </div>
    </WorkspaceShell>
  );
}
