/**
 * Server only. Sends the 6 digit code emails through Resend (spec 0009, AC-17). Returns a
 * typed result, never throws, and never logs the code or the address on a deploy.
 *
 * Without `RESEND_API_KEY`: in local dev the code is printed to the terminal so you can
 * sign up without email; on any Vercel deploy it is an error (production requires the key
 * in `env.ts`, and a code must never land in deploy logs).
 */
import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { err, ok, type Result } from "@/lib/result";
import { CodeEmail } from "./code-email";
import {
  consultationEmailCopy,
  consultationEmailText,
  type ConsultationEmailInput,
} from "./consultation-copy";
import { ConsultationEmail } from "./consultation-email";
import { codeEmailCopy, codeEmailText, type CodePurpose } from "./copy";
import {
  reportEmailCopy,
  reportEmailText,
  type ReportEmailInput,
} from "./report-copy";
import { ReportEmail } from "./report-email";

export type EmailSendError = { readonly code: "email_send_failed" };

export type OutgoingEmail = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

export type MailerDeps = {
  /** Resend's send, or null when there is no key. Resolves `{ error }` like Resend. */
  readonly send:
    ((email: OutgoingEmail) => Promise<{ readonly error: unknown }>) | null;
  readonly from: string | undefined;
  /** True on a Vercel deploy (preview or production). */
  readonly deployed: boolean;
  readonly render: (purpose: CodePurpose, code: string) => Promise<string>;
  /** The app URL the policy footer links to (spec 0017, AC-4). */
  readonly appUrl: string;
  readonly log: typeof logEvent;
  /** Where the dev fallback prints the code. */
  readonly devPrint: (line: string) => void;
};

export const codeMailer =
  (deps: MailerDeps) =>
  async (
    to: string,
    code: string,
    purpose: CodePurpose,
  ): Promise<Result<void, EmailSendError>> => {
    if (deps.send === null || deps.from === undefined) {
      if (deps.deployed) {
        deps.log("email_send_failed", { reason: "not_configured", purpose });
        return err({ code: "email_send_failed" });
      }
      deps.devPrint(`[dev] ${purpose} code for ${to}: ${code}`);
      return ok(undefined);
    }
    try {
      const { error } = await deps.send({
        from: deps.from,
        to,
        subject: codeEmailCopy(purpose, code).subject,
        html: await deps.render(purpose, code),
        text: codeEmailText(purpose, code, deps.appUrl),
      });
      if (error) {
        deps.log("email_send_failed", { reason: "provider", purpose });
        return err({ code: "email_send_failed" });
      }
      deps.log("email_sent", { purpose });
      return ok(undefined);
    } catch {
      deps.log("email_send_failed", { reason: "exception", purpose });
      return err({ code: "email_send_failed" });
    }
  };

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
/** This deploy's app URL: the email footers link to its policy pages. */
const APP_URL = env.NEXT_PUBLIC_APP_URL;

export const sendCodeEmail = codeMailer({
  send: resend ? (email) => resend.emails.send(email) : null,
  from: env.EMAIL_FROM,
  deployed: env.VERCEL_ENV !== undefined,
  render: (purpose, code) =>
    render(CodeEmail({ purpose, code, appUrl: APP_URL })),
  appUrl: APP_URL,
  log: logEvent,
  devPrint: (line) => {
    console.info(line);
  },
});

/** A report email with its PDF (spec 0015, AC-5). */
export type ReportEmailDeps = {
  readonly send:
    | ((
        email: OutgoingEmail & {
          readonly attachments: readonly {
            readonly filename: string;
            readonly content: Buffer;
          }[];
        },
      ) => Promise<{ readonly error: unknown }>)
    | null;
  readonly from: string | undefined;
  readonly deployed: boolean;
  readonly render: (input: ReportEmailInput) => Promise<string>;
  /** The app URL the policy footer links to (spec 0017, AC-4). */
  readonly appUrl: string;
  readonly log: typeof logEvent;
  readonly devPrint: (line: string) => void;
};

export const reportMailer =
  (deps: ReportEmailDeps) =>
  async (
    to: string,
    input: ReportEmailInput,
    pdf: { readonly filename: string; readonly content: Buffer },
  ): Promise<Result<void, EmailSendError>> => {
    if (deps.send === null || deps.from === undefined) {
      if (deps.deployed) {
        deps.log("email_send_failed", {
          reason: "not_configured",
          purpose: "report",
        });
        return err({ code: "email_send_failed" });
      }
      deps.devPrint(
        `[dev] report email (${pdf.filename}, ${pdf.content.length} bytes) for ${to}`,
      );
      return ok(undefined);
    }
    try {
      const { error } = await deps.send({
        from: deps.from,
        to,
        subject: reportEmailCopy(input).subject,
        html: await deps.render(input),
        text: reportEmailText(input, deps.appUrl),
        attachments: [pdf],
      });
      if (error) {
        deps.log("email_send_failed", {
          reason: "provider",
          purpose: "report",
        });
        return err({ code: "email_send_failed" });
      }
      deps.log("email_sent", { purpose: "report" });
      return ok(undefined);
    } catch {
      deps.log("email_send_failed", { reason: "exception", purpose: "report" });
      return err({ code: "email_send_failed" });
    }
  };

export const sendReportEmail = reportMailer({
  send: resend
    ? (email) =>
        resend.emails.send({ ...email, attachments: [...email.attachments] })
    : null,
  from: env.EMAIL_FROM,
  deployed: env.VERCEL_ENV !== undefined,
  render: (input) => render(ReportEmail({ ...input, appUrl: APP_URL })),
  appUrl: APP_URL,
  log: logEvent,
  devPrint: (line) => {
    console.info(line);
  },
});

/** The email BeamX gets for each booking or cancel (spec 0016, AC-6, AC-7). */
export type ConsultationEmailDeps = Omit<ReportEmailDeps, "render"> & {
  readonly render: (input: ConsultationEmailInput) => Promise<string>;
};

export const consultationMailer =
  (deps: ConsultationEmailDeps) =>
  async (
    to: string,
    input: ConsultationEmailInput,
    attachments: readonly {
      readonly filename: string;
      readonly content: Buffer;
    }[],
  ): Promise<Result<void, EmailSendError>> => {
    const purpose = `consultation_${input.kind}`;
    if (deps.send === null || deps.from === undefined) {
      if (deps.deployed) {
        deps.log("email_send_failed", { reason: "not_configured", purpose });
        return err({ code: "email_send_failed" });
      }
      deps.devPrint(
        `[dev] ${purpose} email with ${attachments.length} reports for ${to}`,
      );
      return ok(undefined);
    }
    try {
      const { error } = await deps.send({
        from: deps.from,
        to,
        subject: consultationEmailCopy(input).subject,
        html: await deps.render(input),
        text: consultationEmailText(input, deps.appUrl),
        attachments,
      });
      if (error) {
        deps.log("email_send_failed", { reason: "provider", purpose });
        return err({ code: "email_send_failed" });
      }
      deps.log("email_sent", { purpose });
      return ok(undefined);
    } catch {
      deps.log("email_send_failed", { reason: "exception", purpose });
      return err({ code: "email_send_failed" });
    }
  };

export const sendConsultationEmail = consultationMailer({
  send: resend
    ? (email) =>
        resend.emails.send({ ...email, attachments: [...email.attachments] })
    : null,
  from: env.EMAIL_FROM,
  deployed: env.VERCEL_ENV !== undefined,
  render: (input) => render(ConsultationEmail({ ...input, appUrl: APP_URL })),
  appUrl: APP_URL,
  log: logEvent,
  devPrint: (line) => {
    console.info(line);
  },
});
