/**
 * Server only. The PDF download and the report email (spec 0015, AC-1, AC-5): the route
 * logic with every effect passed in, so the routes stay thin and this stays testable.
 * Returns status plus body, never throws; logs ids only (AC-7).
 */
import { limitKeys } from "@/lib/limits";
import type { logEvent } from "@/lib/log";
import type { Result } from "@/lib/result";
import type { EmailSendError } from "@/email/send";
import type { ReportEmailInput } from "@/email/report-copy";
import { loadReportPdf, type PdfDeps, type PdfReport } from "./report-pdf";

/** Report emails one account may send in an hour (AC-5). */
export const REPORT_EMAILS_PER_HOUR = 5;

/** `ada@gmail.com` → `a***@gmail.com`. Pure. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
};

/** The UTC hour bucket, `2026-11-27T14`. Pure. */
export const hourOf = (now: Date): string => now.toISOString().slice(0, 13);

export type JsonReply = { readonly status: number; readonly body: unknown };

export type PdfReply =
  | { readonly ok: true; readonly pdf: Buffer; readonly filename: string }
  | { readonly ok: false; readonly reply: JsonReply };

const pdfError = (code: "not_found" | "not_ready"): JsonReply =>
  code === "not_found"
    ? { status: 404, body: { code: "not_found" } }
    : { status: 409, body: { code: "not_ready" } };

/** AC-1: the owner's ready report as a PDF; 404 for anyone else, 409 when not ready. */
export const downloadPdf = async (
  deps: PdfDeps,
  ownerId: string,
  runId: string,
): Promise<PdfReply> => {
  const r = await loadReportPdf(deps, ownerId, runId);
  return r.ok
    ? { ok: true, pdf: r.value.pdf, filename: r.value.filename }
    : { ok: false, reply: pdfError(r.error.code) };
};

export type EmailDeps = PdfDeps & {
  /** Adds one to the counter and returns the new value, or null when Redis failed. */
  readonly take: (key: string) => Promise<number | null>;
  readonly giveBack: (key: string) => Promise<void>;
  readonly send: (
    to: string,
    input: ReportEmailInput,
    pdf: { readonly filename: string; readonly content: Buffer },
  ) => Promise<Result<void, EmailSendError>>;
  readonly appUrl: string;
  readonly now: () => Date;
  readonly log: typeof logEvent;
};

export type EmailAccount = {
  readonly id: string;
  readonly isAnonymous: boolean;
  readonly email: string;
};

const chatUrl = (appUrl: string, report: PdfReport): string | null =>
  report.conversationId === null
    ? null
    : `${appUrl.replace(/\/+$/, "")}/c/${report.conversationId}`;

/** AC-5: emails the report to the account's verified address, 5 an hour at most. */
export const emailReport = async (
  deps: EmailDeps,
  account: EmailAccount,
  runId: string,
): Promise<JsonReply> => {
  if (account.isAnonymous)
    return { status: 401, body: { code: "sign_in_required" } };
  const key = limitKeys.reportEmail(account.id, hourOf(deps.now()));
  const count = await deps.take(key);
  // A failed counter lets the email through, like every other guard.
  if (count !== null && count > REPORT_EMAILS_PER_HOUR) {
    await deps.giveBack(key);
    return { status: 429, body: { code: "rate_limited" } };
  }
  const giveBack = async () => {
    if (count !== null) await deps.giveBack(key);
  };
  const loaded = await loadReportPdf(deps, account.id, runId);
  if (!loaded.ok) {
    await giveBack();
    return pdfError(loaded.error.code);
  }
  const report = loaded.value;
  const sent = await deps.send(
    account.email,
    {
      toolName: report.toolName,
      headline: report.headline,
      chatUrl: chatUrl(deps.appUrl, report),
    },
    { filename: report.filename, content: report.pdf },
  );
  if (!sent.ok) {
    await giveBack();
    deps.log("report_email_failed", { runId });
    return { status: 502, body: { code: "email_send_failed" } };
  }
  deps.log("report_emailed", { runId });
  return { status: 200, body: { sentTo: maskEmail(account.email) } };
};
