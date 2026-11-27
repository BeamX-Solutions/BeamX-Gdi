# Email

## Overview

The 6 digit code emails for sign up and password reset (spec 0009, AC-17), sent through Resend and rendered with React Email. Better Auth's `emailOTP` plugin calls `sendCodeEmail` from `src/auth/auth.ts`. The report email (spec 0015) sends a ready report's PDF to the account's address; `src/assistant/report-share.ts` calls `sendReportEmail`.

## Key files

| Path               | Owns                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `copy.ts`          | Pure words of each email (`codeEmailCopy`, `codeEmailText`), so the HTML and plain text always match    |
| `code-email.tsx`   | The React Email template                                                                                |
| `send.ts`          | `codeMailer` (deps passed in, testable) and the wired `sendCodeEmail`; returns a `Result`, never throws |
| `report-copy.ts`   | Pure words of the report email (`reportEmailCopy`, `reportEmailText`)                                   |
| `report-email.tsx` | The report email template; `reportMailer` / `sendReportEmail` in `send.ts` attach the PDF               |

## Conventions

- `RESEND_API_KEY` and `EMAIL_FROM` come from `src/lib/env.ts`; both are required on Production and Preview. Use a sending only key limited to the BeamX domain.
- Without a key in local dev, the code is printed to the server terminal so you can sign up without email. On any Vercel deploy a missing key is an `email_send_failed` error: a code must never land in deploy logs.
- Never log the code or the address; log lines carry only the purpose and the failure reason.
- A send failure is a typed `email_send_failed`; `auth.ts` turns it into Better Auth's `EMAIL_SEND_FAILED` so the dialog shows a friendly message.
- Email clients can't read the app's CSS variables, so `code-email.tsx` writes the DESIGN.md brand colors as hex values. This folder sits outside `pnpm check:colors`, which covers `src/components` and `src/app` only.

## Agent skills

- [resend](../../.claude/skills/resend/): `resend/resend-skills`, the Resend API: sending, domains, webhooks
- [react-email](../../.claude/skills/react-email/): `resend/resend-skills`, React Email templates and rendering
- [email-best-practices](../../.claude/skills/email-best-practices/): `resend/email-best-practices`, deliverability, SPF/DKIM/DMARC, accessible emails

Declined: Resend MCP

## Related specs

- [0009 Accounts and sign up to save](../../docs/specs/0009-accounts-sign-up/index.md)
- [0015 Report PDF and email](../../docs/specs/0015-report-pdf-email/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
