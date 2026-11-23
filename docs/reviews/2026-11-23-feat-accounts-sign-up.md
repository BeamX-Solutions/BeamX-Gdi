# Review, feat/accounts-sign-up, 2026-11-23

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 65 files, branch vs main
**Verdict**: Approve with nits

## Summary
Adds email code sign up (Better Auth emailOTP on the anonymous plugin), password set, sign in, reset, delete account, Upstash auth rate limits, BotID on the auth POSTs, Resend code emails, and a daily guest purge folded into the billing cron. The server side follows spec 0009 and the AGENTS.md rules closely (typed results, Zod boundaries, env via env.ts, errors propagate from onLinkAccount). No blockers or majors; a few minors around edge behavior and abuse surface. The review was a targeted read of the auth, route, cron, purge, email and dialog flow code, not every UI file.

## Minor
### 🟡 Email-check message wrong for an abandoned sign up, `src/db/queries/users.ts` (emailStatus)
**Problem**: The email-OTP sign in creates a user with no account row. If set-password fails or the user closes the dialog, the user has no credential account, so `emailStatus` returns `google_only` and the dialog tells them to use Google (not built yet) or Forgot password.
**Why it matters**: Confusing copy for a real path (AC-2 says the password step cannot be skipped, but closing the dialog does).
**Suggested fix**: Distinguish "no account rows at all" (say an account exists, use Forgot password) from a real Google account; or only say google_only when a google account row exists.

### 🟡 No per email limit on sending codes, `src/auth/rate-limit.ts` (AUTH_RATE_RULES)
**Problem**: send-verification-otp and request-password-reset are limited only per IP (3/min). Sign-in type send also works for existing addresses.
**Why it matters**: Rotating IPs can mail-bomb one address and burn Resend quota; the sender reputation suffers.
**Suggested fix**: Add a per email counter (like the email-check one) to the send paths, or accept and note it in the spec.

### 🟡 Email-check per email limit can lock out the real owner, `src/auth/rate-limit.ts` (allowEmailCheck)
**Problem**: Every call counts toward 3 an hour per email, and a third party can spend those for a victim's address; legitimate retries (typo fixes, going back) also burn them.
**Why it matters**: A user can be blocked from sign up for an hour. It is spec-defined, so low severity.
**Suggested fix**: Count the per-email limit only for calls that return a non-"none" status, or raise it.

### 🟡 Unexpected error in delete and set-password routes rethrows, `src/app/api/account/delete/route.ts` (catch), `src/app/api/account/set-password/route.ts`
**Problem**: Non Better Auth errors are rethrown, giving a 500.
**Why it matters**: AGENTS.md says expected failures return typed results and the UI never shows a 500; the dialog's `catch` covers it, but a JSON `{ code: "server_error" }` is cleaner. Also `stale-session.ts` adds one DB read to every sign in that carries a session cookie (small, sign in only).
**Suggested fix**: Return a typed 500 body and log; accept the extra read or fold it into the guest lookup.

## Nits
- ⚪ `src/components/auth/account-control.tsx:83`, `authClient.signOut()` result is ignored; on failure the page still navigates to `/` while the session lives.
- ⚪ `src/components/auth/auth-dialog.tsx`, 743 lines in one file; split screens into components when next touched.
- ⚪ `src/lib/batches.ts`, `complete: true` on a short batch can also mean rows were skipped by SKIP LOCKED; harmless (next day), worth a comment.

## Strengths
- Purge is one atomic SQL statement with SKIP LOCKED, in-flight guards (active holds, generating reports) and a bounded time budget, with real DB integration tests.
- Careful handling of Better Auth edge cases: stale session cookie hook, blocked `/sign-up/email` and `/delete-user`, `onLinkAccount` errors propagate, rate limits fail open and skip the shared no-IP bucket, cron jobs isolated so one failure never stops the other.
- BotID path list is a single shared constant used by both the client and the server.

## Test coverage
Good: unit tests for the route guards, rate limiter, stale-session helpers, account-verified hook, cron, batches, env, email send and auth copy; integration tests for sign up, delete account, purge and accounts; an e2e flow was added. Gaps: no test for the abandoned-sign-up `emailStatus` case, and the delete/set-password routes' unexpected-error path.
