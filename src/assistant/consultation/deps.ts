/**
 * Server only. The real dependencies of the Calendly webhook (spec 0016): the queries,
 * the chat message, and BeamX's email with the client's profile and report PDFs.
 */
import * as consultations from "@/db/queries/consultations";
import * as messages from "@/db/queries/messages";
import * as profile from "@/db/queries/profile";
import { newId } from "@/db/id";
import { sendConsultationEmail } from "@/email/send";
import type { ConsultationEmailInput } from "@/email/consultation-copy";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import {
  formatFact,
  isFactKey,
  factCatalog,
  parseFact,
} from "@/tools/registry";
import { loadReportPdf } from "../report-pdf";
import { pdfDeps } from "../report-share-deps";
import type { BookingNotice, WebhookDeps } from "./webhook";
import { callTime } from "./words";

/** The profile as labeled lines, in the catalog's order (spec 0012). Pure. */
export const profileLines = (
  facts: readonly { readonly key: string; readonly value: unknown }[],
): ConsultationEmailInput["profile"] =>
  facts.flatMap((f) =>
    isFactKey(f.key) && parseFact(f.key, f.value) !== null
      ? [{ label: factCatalog[f.key].label, value: formatFact(f.key, f.value) }]
      : [],
  );

/** AC-6: the newest ready reports as PDFs; one that fails to render is left out. */
const reportPdfs = async (userId: string) => {
  const ids = await consultations.readyRunIds(userId);
  const loaded = await Promise.all(
    ids.map((runId) => loadReportPdf(pdfDeps, userId, runId)),
  );
  return loaded.flatMap((r) => (r.ok ? [r.value] : []));
};

const notify = async (notice: BookingNotice): Promise<void> => {
  const to = env.CONSULTATION_NOTIFY_EMAIL;
  if (to === undefined) {
    logEvent("consultation_notify_skipped", {
      consultationId: notice.consultationId,
    });
    return;
  }
  const booked = notice.kind === "booked";
  const [facts, reports] = booked
    ? await Promise.all([profile.get(notice.userId), reportPdfs(notice.userId)])
    : [[], []];
  const sent = await sendConsultationEmail(
    to,
    {
      kind: notice.kind,
      clientName: notice.clientName,
      clientEmail: notice.clientEmail,
      callTime: notice.startTime === null ? null : callTime(notice.startTime),
      profile: profileLines(facts),
      reports: reports.map((r) => ({
        toolName: r.toolName,
        headline: r.headline,
      })),
    },
    reports.map((r) => ({ filename: r.filename, content: r.pdf })),
  );
  if (!sent.ok) throw new Error("consultation email not sent");
};

export const webhookDeps: WebhookDeps = {
  signingKey: env.CALENDLY_WEBHOOK_SIGNING_KEY,
  nowS: () => Math.floor(Date.now() / 1000),
  book: consultations.book,
  cancel: consultations.cancel,
  say: async (userId, conversationId, text) => {
    const saved = await messages.append(userId, conversationId, [
      { id: newId(), role: "assistant", parts: [{ type: "text", text }] },
    ]);
    if (!saved.ok || saved.value === 0) throw new Error("message not saved");
  },
  notify,
  log: logEvent,
};
