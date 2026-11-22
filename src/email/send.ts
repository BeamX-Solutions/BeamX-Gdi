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
import { codeEmailCopy, codeEmailText, type CodePurpose } from "./copy";

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
        text: codeEmailText(purpose, code),
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

export const sendCodeEmail = codeMailer({
  send: resend ? (email) => resend.emails.send(email) : null,
  from: env.EMAIL_FROM,
  deployed: env.VERCEL_ENV !== undefined,
  render: (purpose, code) => render(CodeEmail({ purpose, code })),
  log: logEvent,
  devPrint: (line) => {
    console.info(line);
  },
});
