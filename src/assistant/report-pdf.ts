/**
 * Server only. A ready report as a PDF (spec 0015, AC-1 to AC-3): reads the run with
 * its owner, draws it with the reader for its stored version, and renders Luna's plan
 * or the shared block layout. Pure helpers plus one entry with its reads passed in.
 */
import { billingConfig } from "@/billing/config";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { LunaContent } from "@/tools/luna/plan";
import {
  formatAnswer,
  getReader,
  getTool,
  type ReportBlock,
} from "@/tools/registry";
import { buildView, type RunForView } from "./report-status";

/** What the PDF reads: the run with its answers and report (`runs.get`). */
export type ReportRead = RunForView & {
  readonly run: {
    readonly toolId: string;
    readonly toolVersion: string;
    readonly completedAt: string | null;
    readonly conversationId: string | null;
    readonly scores: unknown;
  };
  readonly report: {
    readonly status: string;
    readonly content: unknown;
  } | null;
};

export type PdfReadError = { readonly code: "not_found" | "not_ready" };

export type PdfReport = {
  readonly pdf: Buffer;
  readonly filename: string;
  readonly toolName: string;
  readonly conversationId: string | null;
  /** "Beacon 62.5 of 100", or Luna's first headline figure; null when none. */
  readonly headline: string | null;
};

/** A stored timestamp as a Date, or null. */
const dateOf = (stored: string | null): Date | null => {
  if (stored === null) return null;
  const at = new Date(
    stored
      .trim()
      .replace(" ", "T")
      .replace(/(\.\d{3})\d+/, "$1")
      .replace(/([+-]\d{2})$/, "$1:00"),
  );
  return Number.isNaN(at.getTime()) ? null : at;
};

const zone = billingConfig.chat.dayTimeZone;

/** "27 November 2026" in Lagos. */
export const longDay = (at: Date): string =>
  at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  });

/** "2026-11-27" in Lagos (`en-CA` formats as ISO). */
export const isoDay = (at: Date): string =>
  at.toLocaleDateString("en-CA", { timeZone: zone });

/** `BeamX-Beacon-2026-11-27.pdf`; the tool name keeps letters and digits only. */
export const pdfFilename = (toolName: string, at: Date): string =>
  `BeamX-${toolName.replace(/[^A-Za-z0-9]/g, "")}-${isoDay(at)}.pdf`;

/** The headline for the email: the score header, else the first bullet's lead. */
export const headlineOf = (
  toolName: string,
  blocks: readonly ReportBlock[],
): string | null => {
  for (const b of blocks) {
    if (b.kind === "score_header")
      return `${toolName} ${b.score} of ${b.max}: ${b.title}`;
    if (b.kind === "rich_section") {
      const first = b.parts.find((p) => p.kind === "bullets");
      const item = first?.kind === "bullets" ? first.items[0] : undefined;
      if (item?.lead) return `${item.lead} ${item.text}`.trim();
    }
  }
  return null;
};

/** An answer in plain words, or null when absent or empty. */
const answerText = (
  toolId: string,
  read: ReportRead,
  questionId: string,
): string | null => {
  const tool = getTool(toolId);
  const row = read.answers.find((a) => a.questionId === questionId);
  if (!tool.ok || row === undefined) return null;
  const question = tool.value.questions.find((q) => q.id === questionId);
  if (question === undefined) return null;
  const value = row.value;
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    !Array.isArray(value)
  )
    return null;
  const text = formatAnswer(
    question,
    value as string | number | readonly string[],
  );
  return text.trim() === "" || text === "Skipped" ? null : text.trim();
};

export type PdfDeps = {
  readonly readRun: (
    ownerId: string,
    runId: string,
  ) => Promise<
    Result<
      ReportRead & { readonly run: { readonly conversationId: string | null } },
      { readonly code: "not_found" }
    >
  >;
  readonly render: (
    input:
      | {
          readonly kind: "luna";
          readonly content: LunaContent;
          readonly facts: {
            readonly business: string;
            readonly industry: string;
            readonly model: string;
            readonly date: string;
          };
        }
      | {
          readonly kind: "blocks";
          readonly toolName: string;
          readonly business: string | null;
          readonly date: string;
          readonly blocks: readonly ReportBlock[];
        },
  ) => Promise<Buffer>;
};

export const loadReportPdf = async (
  deps: PdfDeps,
  ownerId: string,
  runId: string,
): Promise<Result<PdfReport, PdfReadError>> => {
  const read = await deps.readRun(ownerId, runId);
  if (!read.ok) return err({ code: "not_found" });
  const { run } = read.value;
  const reader = getReader(run.toolId, run.toolVersion);
  if (read.value.report?.status !== "ready" || !reader.ok)
    return err({ code: "not_ready" });
  const view = buildView(reader.value, read.value);
  if (!view.ok) return err({ code: "not_ready" });
  const tool = getTool(run.toolId);
  const toolName = tool.ok ? tool.value.name : run.toolId;
  const at = dateOf(run.completedAt) ?? new Date();
  const date = longDay(at);

  const pdf =
    run.toolId === "luna"
      ? await deps.render({
          kind: "luna",
          // Parsed by the reader's own schema in `buildView` above.
          content: reader.value.contentSchema.parse(
            read.value.report.content,
          ) as LunaContent,
          facts: {
            business:
              answerText(run.toolId, read.value, "business-name") ??
              "Your business",
            industry: answerText(run.toolId, read.value, "industry") ?? "",
            model: answerText(run.toolId, read.value, "business-model") ?? "",
            date,
          },
        })
      : await deps.render({
          kind: "blocks",
          toolName,
          business: answerText(run.toolId, read.value, "business_name"),
          date,
          blocks: view.value,
        });

  return ok({
    pdf,
    filename: pdfFilename(toolName, at),
    toolName,
    conversationId: run.conversationId,
    headline: headlineOf(toolName, view.value),
  });
};
