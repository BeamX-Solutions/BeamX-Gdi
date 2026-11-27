/**
 * `readReport` (spec 0014, AC-1 to AC-3, AC-6): read one of the client's ready reports
 * as plain text, so answers about results quote the real report. Read only: no
 * approval card, nothing written, no price beyond the chat message.
 */
import { tool } from "ai";
import { z } from "zod";
import { billingConfig } from "@/billing/config";
import type { Result } from "@/lib/result";
import type {
  ToolReader,
  UnknownTool,
  UnsupportedVersion,
} from "@/tools/registry";
import { buildView, type RunForView } from "../report-status";
import { reportText } from "../report-text";
import type { ToolEnv } from "./env";

export const readReportInput = z.strictObject({
  runId: z
    .string()
    .max(100)
    .describe(
      "The completed run whose report to read, from the run state note (this chat's completed runs or the reports in other chats).",
    ),
});

/** What `readReport` reads: the run with its answers and report (`runs.get`). */
export type ReportRead = RunForView & {
  readonly run: {
    readonly toolId: string;
    readonly toolVersion: string;
    readonly completedAt: string | null;
    readonly scores: unknown;
  };
  readonly report: {
    readonly status: string;
    readonly content: unknown;
  } | null;
};

export type ReadReportOutput =
  | {
      readonly ok: true;
      readonly toolName: string;
      readonly finishedOn: string | null;
      readonly text: string;
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly error: "not_found" | "not_ready" };

/** "24 Nov 2026" in Lagos, from a stored timestamp, or null. */
const dayOf = (stored: string | null): string | null => {
  if (stored === null) return null;
  const at = new Date(
    stored
      .trim()
      .replace(" ", "T")
      .replace(/(\.\d{3})\d+/, "$1")
      .replace(/([+-]\d{2})$/, "$1:00"),
  );
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: billingConfig.chat.dayTimeZone,
      });
};

/** The report as text for a read run. Pure. */
export const readReportResult = (
  read: ReportRead,
  reader: Result<ToolReader, UnknownTool | UnsupportedVersion>,
  toolName: string,
): ReadReportOutput => {
  if (read.report?.status !== "ready" || !reader.ok)
    return { ok: false, error: "not_ready" };
  const view = buildView(reader.value, read);
  if (!view.ok) return { ok: false, error: "not_ready" };
  const { text, truncated } = reportText(view.value);
  return {
    ok: true,
    toolName,
    finishedOn: dayOf(read.run.completedAt),
    text,
    truncated,
  };
};

export const readReportTool = (env: ToolEnv) =>
  tool({
    description:
      "Read one of the client's ready reports as plain text: its scores, findings and sections. Use it before answering any question about a report or the client's results. Free, and no card is shown.",
    inputSchema: readReportInput,
    execute: async ({ runId }): Promise<ReadReportOutput> => {
      const { deps } = env;
      const done = (output: ReadReportOutput) => {
        deps.log("assistant_tool", {
          name: "readReport",
          outcome: output.ok ? "ok" : output.error,
        });
        return output;
      };
      const read = await deps.readRun(env.owner.current, runId);
      if (!read.ok) return done({ ok: false, error: "not_found" });
      const found = deps.getTool(read.value.run.toolId);
      return done(
        readReportResult(
          read.value,
          deps.getReader(read.value.run.toolId, read.value.run.toolVersion),
          found.ok ? found.value.name : read.value.run.toolId,
        ),
      );
    },
  });
