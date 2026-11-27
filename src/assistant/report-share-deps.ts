/**
 * Server only. The real dependencies of the PDF and report email routes (spec 0015).
 */
import * as runs from "@/db/queries/runs";
import { sendReportEmail } from "@/email/send";
import { env } from "@/lib/env";
import { limitStore } from "@/lib/limits";
import { logEvent } from "@/lib/log";
import { reportPdf } from "@/pdf";
import type { PdfDeps } from "./report-pdf";
import type { EmailDeps } from "./report-share";

export const pdfDeps: PdfDeps = {
  readRun: runs.get,
  render: reportPdf,
};

export const emailDeps: EmailDeps = {
  ...pdfDeps,
  take: (key) => limitStore.take("report_email", key),
  giveBack: (key) => limitStore.giveBack("report_email", key),
  send: sendReportEmail,
  appUrl: env.NEXT_PUBLIC_APP_URL,
  now: () => new Date(),
  log: logEvent,
};
