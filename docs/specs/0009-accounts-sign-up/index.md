# 0009. Accounts and sign up to save

**Date**: 2026-11-22
**Status**: Proposed

## Summary

Guests can already chat and run a tool without an account. This feature lets them sign up or sign in with an email and password (Google sign in is designed here but built later, once BeamX creates a Google OAuth client), and keeps everything they did as a guest. An email account is created only when the person types the 6 digit code we email them, in the same tab, so the email is always real, the guest's work is always carried over, and nobody can claim an email they don't own. It also adds sign out, deleting your own account, and a daily cleanup that removes guests nobody came back to after 30 days.

## Requirements

**User stories**:

- As a guest who just got a report, I want to sign up in a few taps and find my chat and report still there, so that nothing I did is lost.
- As a returning client, I want to sign in with Google or my email and password and stay signed in for weeks, so that I can pick up where I left off.
- As a client, I want to delete my account and know my data is gone.
- As the BeamX team, I want guest data that nobody claims to disappear on its own, and every account email to be real.

**Acceptance criteria**:

- **AC-1**: A guest can open the auth dialog from the header Sign in button, from the save prompt after a report, and from a Sign up action on the guest limit notices (`runs_daily`, `chat_daily`, `chats_daily`) and on the guest short balance card. The dialog sits over the chat (a bottom sheet on narrow screens) and closes back to the same chat. Signed in users never see these prompts.
- **AC-2**: Email sign up asks for first name (1 to 50 characters), email and password (8 to 128 characters). It first checks the email: if no account has it, it sends a 6 digit code and shows a code screen in the same dialog. Entering the right code creates the account with the email verified, signs in, links the guest, and then sets the password and first name, all before the dialog says done. If setting the password fails (for example it is in a known breach), the account stays signed in and the dialog asks for another password; it cannot be skipped. Until the code is entered no account exists and the guest is unchanged.
- **AC-3**: A code is valid for 10 minutes and allows 3 wrong tries; a 4th try, or an expired code, asks the user to get a new code. "Send a new code" is available after 60 seconds. Wrong, expired and used up codes each show a friendly message in the dialog, and a send that fails shows "We couldn't send the email, try again."
- **AC-4** (Google milestone, built later): Google sign up and sign in redirect to Google and return to the same chat URL, signed in, with the guest linked. A new account's first name is Google's given name; a returning user's name is not overwritten. Inside common in app browsers (detected from the user agent) the Google button is hidden and the dialog says "Open this page in your browser to use Google."
- **AC-5**: Email sign in with the right email and password signs in and links the guest. A wrong email or password shows one message for both ("Email or password is wrong").
- **AC-6**: When a guest links, all their chats, runs, reports, usage and credits move to the account in one batch (spec 0002 AC-6, spec 0004 AC-12). After the dialog closes the user is on the same chat, the header shows the account menu, and a toast says "You're signed in. Your work is saved." A reply or report still streaming during the link saves to the account. If the link fails, the user is not signed in and the guest, their cookie and their data are unchanged.
- **AC-7**: On the sign in form, a guest with unspent credits sees one line: "Your chats and reports come with you. Free guest credits don't carry over if your account already has credits." It is not shown on sign up, where a new account keeps the whole guest balance.
- **AC-8**: Signing up with an email that already has an account shows "An account with this email already exists" with a button to switch to sign in (and, for an account made with Google, a hint to use Google or Forgot password to add one).
- **AC-9** (Google milestone, built later): A password account and a Google account with the same email are one user: signing in with Google on an email that has a password account links Google to it, and a Google only user can add a password with Forgot password.
- **AC-10**: Forgot password: enter the email, get a 6 digit code, enter it with a new password in the same dialog. A successful reset signs out every session of that user and then signs in on this device. The response never says whether the email has an account.
- **AC-11**: A sign in lasts 30 days and is extended (at most once a day) while used.
- **AC-12**: The account menu shows the first name and email, Sign out, and Delete account. Sign out ends the session and goes to `/` with an empty chat; the next send creates a fresh guest (subject to spec 0008's guest per IP cap, which shows its existing card).
- **AC-13**: Delete account opens a dialog naming what is lost (chats, reports, unspent credits) and asks the user to type their email. It needs a session created within the last 24 hours, otherwise the dialog asks them to sign in again first. Deleting is allowed at any time, including during a run; it removes the user and everything that cascades from it (spec 0002 AC-7, spec 0004 AC-19), ends the session, goes to `/`, and shows "Your account was deleted." Work still finishing for that user afterwards is dropped without an error.
- **AC-14**: The daily job deletes guests (anonymous users) whose last activity is more than 30 days old and who have no active credit hold and no report generating. Last activity is the newest of the user row's `updated_at`, their latest `session.updated_at`, `conversation.updated_at` and `tool_run.updated_at`. It works in batches of 50 within a 120 second budget, logs the counts and the guest credits forfeited, and leaves the rest for the next day.
- **AC-15**: The auth POSTs (sign in, send code, code sign in, reset password, request password reset, set password, email check, delete account) are BotID checked (a bot gets `403 {"code":"bot"}`) and rate limited per IP: sign in 5 a minute, send code 3 a minute, code sign in 5 a minute, reset and request reset 3 a minute, email check 5 a minute per IP and 3 an hour per email, Google start 10 a minute. Over a limit returns `429` and the dialog says "Too many tries, wait a minute." Better Auth's own limit never applies to the guest's anonymous sign in (spec 0008 guards it). When Redis is down the limits allow, like spec 0008.
- **AC-16**: Whenever a non guest user is created or updated with a verified email, `onAccountVerified(userId)` is called. It is idempotent (safe to call many times). In #8 it only logs `account_verified`; spec 0004 milestone 4 plugs `claimPendingGrants` into it. A failure in it is logged and never blocks sign up or sign in.
- **AC-17**: Code emails come from a BeamX domain verified in Resend, rendered with React Email in the BeamX brand, with a plain text version, and say the code, what it is for, that it expires in 10 minutes, and "If you didn't ask for this, ignore this email."
- **AC-18**: A signed in user can open only their own chats and reports; another user's chat id answers `404`, exactly as for guests today.

## Decision

**Chosen option**: Option 1: email and password plus Google, with the email account created by a same tab code, on the existing anonymous plugin

Email accounts are created by Better Auth's email code sign in (the `email-otp` plugin), which makes the user already verified, signs in and links the guest in the tab that holds the guest cookie, and the password is attached right after in that same session; Google sign in links through the same plugin.

**Implementation skills**: `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-security-best-practices/`) · `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/email-and-password-best-practices/`) · `create-auth` (`better-auth/skills`, `.claude/skills/create-auth/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `email-best-practices` (`resend/email-best-practices`, `.claude/skills/email-best-practices/`) · `upstash-redis-js` (`upstash/skills`, `.claude/skills/upstash-redis-js/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Rationale

Reasoning and options considered: see [rationale.md](rationale.md).

## Feature design

**Better Auth configuration** (`src/auth/auth.ts`, Better Auth 1.7.25):

- `emailAndPassword`: `enabled: true`, `requireEmailVerification: true` (a safety net: every account is verified anyway), `minPasswordLength: 8`, `maxPasswordLength: 128`, `revokeSessionsOnPasswordReset: true`. `/sign-up/email` is never used and is blocked in the route (below), so no unverified account can be created.
- `emailOTP` plugin: `otpLength: 6`, `expiresIn: 600`, `allowedAttempts: 3`, `disableSignUp: false` (the code sign in creates the account), `sendVerificationOTP({ email, otp, type })` sending through `src/email/` for the types `sign-in` (sign up) and `forget-password`, awaited, with a send failure mapped to a typed error. `overrideDefaultEmailVerification` and `sendVerificationOnSignUp` are not set (unused).
- `haveIBeenPwned` plugin with `paths` set to `/set-password` and `/email-otp/reset-password`.
- `socialProviders.google`: `clientId`, `clientSecret`, `mapProfileToUser: (profile) => ({ name: profile.given_name || profile.name })`; `overrideUserInfoOnSignIn` stays off, so only a new account takes the name.
- `account.accountLinking`: `enabled: true`, `trustedProviders: ["google"]`.
- `session`: `expiresIn: 60 * 60 * 24 * 30`, `updateAge: 60 * 60 * 24`, `freshAge: 60 * 60 * 24` (freshness counts from the session's creation).
- `user.deleteUser`: `enabled: true`. Our delete route calls it without a password, so the fresh session rule always applies.
- `rateLimit`: `enabled: true`, `customStorage: { consume(key, { window, max }) }` over Upstash with one atomic script per call (increment, set the window expiry on first hit, return `{ allowed, retryAfter }`), keys `auth:rl:<key>`; any Redis error returns `{ allowed: true }` and logs `limit_check_failed` with `auth_rate_limit`. `customRules` (paths without the `/api/auth` prefix): `/sign-in/email` 5 per 60s, `/email-otp/send-verification-otp` 3 per 60s, `/sign-in/email-otp` 5 per 60s, `/email-otp/request-password-reset` 3 per 60s, `/email-otp/reset-password` 3 per 60s, `/email-otp/check-verification-otp` 5 per 60s, `/set-password` 5 per 60s, `/sign-in/social` 10 per 60s, `/sign-in/anonymous` `false`. No `secondaryStorage`: sessions stay in Postgres.
- `advanced`: IP settings left at their defaults (`ipAddressHeaders` is `x-forwarded-for`; Vercel sends a single value).
- `databaseHooks.user.create.after` and `databaseHooks.user.update.after`: when `user.emailVerified && !user.isAnonymous`, call `onAccountVerified(user.id)` wrapped so it never throws.
- `anonymous({ onLinkAccount: linkGuestAccount })` unchanged.

**Route guards** (`src/app/api/auth/[...all]/route.ts`): `POST /api/auth/sign-up/email` answers `404` before Better Auth. Every auth POST listed in AC-15 runs `isBot()` first. The anonymous sign in keeps spec 0008's guest per IP cap. Each BotID protected path is also listed in `src/instrumentation-client.ts` (`initBotId` `protect`), including `/api/account/*`.

**Data model sketch** (no migration; Better Auth's existing tables):

| Table | Key fields used | Relationship | Notes |
|---|---|---|---|
| `user` | `id` uuid PK, `name` text not null (first name), `email` text not null unique, `email_verified` bool, `is_anonymous` bool, `created_at`, `updated_at` | 1:N `account`, 1:N `session` | every non guest user has `email_verified = true` |
| `account` | `provider_id` (`credential` or `google`), `account_id`, `password` hash (credential only) | N:1 `user`, cascade | a user can have both |
| `session` | `token`, `expires_at`, `created_at`, `updated_at`, `user_id` | N:1 `user`, cascade | 30 days, extended daily |
| `verification` | `identifier`, `value`, `expires_at` | none | the codes, 10 minute expiry |
| Upstash `auth:rl:<key>` | count with window expiry | none | Better Auth rate limit records |
| Upstash `auth:email-check:<sha256 of email>` | count, 1 hour expiry | none | the per email limit on the email check |

**State transitions**:

`(no account) ─code entered─▶ verified account, signed in, guest linked ─password and name set─▶ complete` · `account ─delete─▶ (gone)` · `guest ─link─▶ (gone, data moved)` · `guest ─30 days inactive, nothing in flight─▶ purged`

**Flows**:

1. Email sign up: `POST /api/account/email-check { email }` → `none`: `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })` → code screen → `authClient.signIn.emailOtp({ email, otp, name })` creates the user (verified, named) and the session; the anonymous plugin matches `/sign-in`, so `onLinkAccount` moves the guest and Better Auth deletes it → `POST /api/account/set-password { password }` (our route calls the server only `auth.api.setPassword` with the request headers; breach check applies) → done. `exists` or `google_only`: show AC-8.
2. Email sign in: `authClient.signIn.email({ email, password })`; the anonymous plugin links on `/sign-in`.
3. Google: `authClient.signIn.social({ provider: "google", callbackURL: <current path> })`. The anonymous plugin stores the guest id in the OAuth state on `/sign-in/social`, so the link on `/callback/google` works even if the cookie is not sent back.
4. Reset (and adding a password to a Google only user): `authClient.emailOtp.requestPasswordReset({ email })` (silent for unknown emails) → `authClient.emailOtp.resetPassword({ email, otp, password })` (revokes every session) → `authClient.signIn.email` with the new password.
5. Delete: the client checks the typed email, then `POST /api/account/delete { email }`; the route checks the session is not anonymous and its email equals the typed one (lowercased), then calls `auth.api.deleteUser({ headers, body: {} })`. On `SESSION_EXPIRED` the dialog switches to sign in again.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/account/email-check` | POST | email | `{ status: "none" \| "exists" \| "google_only" }` | none, BotID, 5/min/IP, 3/hour/email | 429, 422 invalid email |
| `/api/auth/email-otp/send-verification-otp` | POST | email, type `sign-in` | ok | none, BotID, 3/min/IP | 429, send failure (typed) |
| `/api/auth/sign-in/email-otp` | POST | email, otp, name | session, user (links guest) | none, BotID, 5/min/IP | 400 `INVALID_OTP`, 400 `OTP_EXPIRED`, 403 `TOO_MANY_ATTEMPTS` |
| `/api/account/set-password` | POST | password | ok | signed in, not anonymous, BotID, 5/min/IP | 400 `PASSWORD_COMPROMISED`, 400 password already set |
| `/api/auth/sign-in/email` | POST | email, password | session (links guest) | none, BotID, 5/min/IP | 401 `INVALID_EMAIL_OR_PASSWORD`, 429 |
| `/api/auth/email-otp/request-password-reset` | POST | email | ok (always) | none, BotID, 3/min/IP | 429 |
| `/api/auth/email-otp/reset-password` | POST | email, otp, password | ok | none, BotID, 3/min/IP | 400 `INVALID_OTP`, `OTP_EXPIRED`, `PASSWORD_COMPROMISED`; 403 `TOO_MANY_ATTEMPTS` |
| `/api/auth/sign-in/social`, `/api/auth/callback/google` | POST, GET | provider, callbackURL | redirect, session | none, 10/min/IP on the start | OAuth errors redirect to the chat with `?auth_error=` |
| `/api/auth/sign-up/email` | POST | any | `404` | blocked | always 404 |
| `/api/auth/sign-out` | POST | none | ok | session | none |
| `/api/account/delete` | POST | email (typed) | ok | session, not anonymous, BotID | 403 `email_mismatch`, 400 `SESSION_EXPIRED` |
| `/api/cron/billing` | GET | bearer | `{ billing: {...} \| { error }, purge: {...} \| { error } }` | `CRON_SECRET` | 401 |

The daily purge joins the existing cron route through `runDailyJobs`: it checks the bearer once (`cronAuthorized`), then runs the billing sweeps and `purgeUsers` independently, each in its own try and catch, and always answers `200` with a per job result (`error` set for a job that threw, which is also logged). The route path stays `/api/cron/billing`, so `vercel.json` does not change.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| AC-1 | is a guest (show prompts) | `session.user.isAnonymous` (client session) |
| AC-1 | save prompt shows | a ready `data-report` part in a guest's chat; dismissed state in `sessionStorage` per chat |
| AC-2 | first name | sign up form field, trimmed, 1 to 50 characters, passed as `name` to `signIn.emailOtp` |
| AC-2, AC-8 | email status | `/api/account/email-check`: `user` by lowercased email with `is_anonymous` not true; `google_only` when it has no `credential` account |
| AC-2, AC-10 | breached password | `haveIBeenPwned` with `paths` `/set-password`, `/email-otp/reset-password` |
| AC-3 | code expiry, tries | `emailOTP` `expiresIn: 600`, `allowedAttempts: 3` |
| AC-3 | resend wait | client timer 60 seconds, backed by the send code limit |
| AC-4 | in app browser | pure `isInAppBrowser(ua)`, matching `FBAN`, `FBAV`, `Instagram`, `Messenger`, `WhatsApp`, `musical_ly`, `Bytedance` |
| AC-4 | first name from Google | `mapProfileToUser`: `given_name`, else `name` (new accounts only) |
| AC-4, AC-6 | return URL | `window.location.pathname` as `callbackURL` |
| AC-6 | guest to link | the anonymous session cookie in the tab, or the OAuth state for Google (anonymous plugin) |
| AC-7 | unspent guest credits | `credits.getSummary` `available > 0` (already read by the header) |
| AC-11 | session length | `session.expiresIn`, `updateAge` |
| AC-13 | fresh session | `session.freshAge` against `session.created_at` |
| AC-14 | guest last activity | `greatest(user.updated_at, max(session.updated_at), max(conversation.updated_at), max(tool_run.updated_at))` |
| AC-14 | in flight work | an `active` `credit_hold` or a `report` with status `generating` for the user |
| AC-14 | credits forfeited | `credit_account.balance` of each purged guest, summed into the log line |
| AC-15 | client IP | Better Auth's default `x-forwarded-for` (auth paths); `requestIp(headers)` for `/api/account/*` |
| AC-16 | verified non guest | `user.emailVerified && !user.isAnonymous` in the user create and update hooks |
| AC-17 | sender | `EMAIL_FROM` env |

**Key invariants**:

- Every non guest user has a verified email; no endpoint can create an unverified account.
- A password is attached only inside a session that proved control of the email.
- The guest is linked only by Better Auth's anonymous plugin in the request that creates the account's session in that tab (or its Google OAuth state); a failed link aborts and keeps the guest (spec 0002).
- One user per email; Google and password are two `account` rows of that user.
- The purge never deletes a non guest user, a guest active in the last 30 days, or a guest with a hold or generating report.
- No limit or hook failure turns into a 500 or blocks sign in, except a failed guest link, which must abort.

**Security model**: Auth endpoints are public but BotID checked and rate limited per IP (and the email check per email). Passwords are hashed by Better Auth (scrypt) and checked against breaches; one can only be set inside a session that proved the email. Codes are 6 digits, 10 minutes, 3 tries, single use. Sessions are httpOnly, secure, sameSite lax cookies. Deletion needs a session created in the last day and the typed email, checked again on the server, and never accepts a password in place of freshness. Reset never reveals whether an email has an account; the email check does (AC-8), accepted for clarity and bounded per IP and per email. Compliance: NDPA 2023 and GDPR. Stored personal data grows by first name, email and password hash; Google's picture is not stored. Deletion erases everything that cascades (spec 0002, 0004). Logs carry user ids, counts and event names, never emails, codes or passwords. Feature #18 lists Resend and Google as processors.

**Failure handling**:

- Code sent but the email never arrives: resend after 60 seconds; Google stays available.
- Account created but `set-password` fails or the tab closes before it: the user is signed in with a verified account and no password; the next visit's account menu and the sign in form's Forgot password both let them set one. The dialog does not finish until a password is set.
- Guest link throws on the code sign in: the plugin aborts; a test proves the guest cookie and data survive, and if a session row was left, the route deletes it.
- A user deleted while a reply or report is finishing: those writes resolve the owner (spec 0002) and drop the write when the user is gone, logging it, never throwing.

**Configuration required**:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the Google OAuth web client (a Google Cloud project, consent screen with the BeamX name and logo, redirect URIs for production, the branch preview and `localhost`). Optional in dev and Preview: without them the Google button is hidden.
- `RESEND_API_KEY`: sending the code emails. Use a key just for this app, with sending access only and limited to `beamxsolutions.com`, and separate keys for Production and Preview. Required in production; in dev without it the code is logged to the server console instead (never in production).
- `EMAIL_FROM`: `BeamX <no-reply@beamxsolutions.com>`. Required in production.
- Sending domain: `beamxsolutions.com` is already verified in BeamX's Resend account (SPF and DKIM). Its DMARC record (`p=none` with `rua` reports to `admin@`) is in place; a duplicate bare record was removed on 2026-11-22. Keep exactly one `_dmarc` TXT record. The domain is shared with BeamX's other email, so its reputation is shared too.

**Critical test scenarios**:

- Happy path: a guest with a chat and a ready report checks a new email, enters the code, sets a password, and finds the same chat, report, runs and credits under the new user; the guest row is gone, verifies **AC-2**, **AC-6**
- No account before the code: after the code is sent but not entered, no user exists for the email and the guest still owns their data, verifies **AC-2**
- `/sign-up/email` answers `404`, verifies **AC-2**
- Breached password at set password keeps the user signed in and asks again, verifies **AC-2**
- Code limits: an expired code, and the 4th try after 3 wrong ones, ask for a new code; a new code works, verifies **AC-3**
- Google: a guest signs in with Google and lands on the same chat with data linked; a returning Google user keeps an edited name; inside an Instagram user agent the button is hidden, verifies **AC-4**, **AC-6**
- Sign in: wrong password and unknown email give the same message, verifies **AC-5**
- Failed link: `linkGuest` forced to throw during the code sign in leaves the guest cookie, guest row and data unchanged, verifies **AC-6**
- Existing email: `exists` shows the switch to sign in, `google_only` adds the Google and reset hint; the 4th check of one email in an hour gets `429`, verifies **AC-8**, **AC-15**
- Linking: password account then Google with the same email gives one user with two `account` rows; a Google only user adds a password with reset, verifies **AC-9**
- Reset: code reset changes the password and ends another device's session; an unknown email gets the same response, verifies **AC-10**
- Forfeit note: shown on sign in for a guest with available credits, not on sign up, verifies **AC-7**
- Sign out returns to `/`, and the next send creates a new guest, verifies **AC-12**
- Delete: a session older than a day is asked to sign in again; a wrong typed email gets `403`; a correct one removes the user and cascades; a report finishing afterwards is dropped without an error, verifies **AC-13**
- Purge: a guest active 29 days ago stays, one 31 days ago (chats, runs, credits) is deleted with everything and its credits logged, one 31 days old with an active hold stays; a verified account never is; the time budget stops early and resumes next day, verifies **AC-14**
- Abuse: the 6th sign in in a minute from one IP gets `429`; a bot gets `403`; Better Auth never limits `/sign-in/anonymous`; Redis down allows, verifies **AC-15**
- Hook: the code sign in calls `onAccountVerified`; a second call is harmless; a throwing hook still completes sign in, verifies **AC-16**
- Ownership: a signed in user opening another user's chat gets `404`, verifies **AC-18**

## Build plan

Tracer Bullet: one real sign up path end to end first (email check, code, account, link, password, toast), then sign in and recovery, then the rest of the account surface, then cleanup. Google comes last, as its own milestone.

1. [ ] Email foundation: `src/email/` with a Resend client (`RESEND_API_KEY`, `EMAIL_FROM` in `env.ts` and `.env.example`, dev console fallback), a React Email `CodeEmail` template with plain text, and `sendCodeEmail(to, code, purpose)` returning a `Result`; unit test the template text, satisfies **AC-17**
2. [ ] Thin thread, email sign up: Better Auth config (`emailOTP` with sign up through the code sign in, `requireEmailVerification`, session lengths, `haveIBeenPwned` paths); `/sign-up/email` blocked; `/api/account/email-check` and `/api/account/set-password`; the auth dialog with sign up, code and password screens (shadcn `Dialog`, bottom `Sheet` on narrow screens, design tokens), opened from the header Sign in button; the signed in header account menu (name, email, Sign out); the toast; integration tests that a guest's data moves on the code sign in and that a failed link keeps the guest, satisfies **AC-1** (header), **AC-2**, **AC-3**, **AC-6**, **AC-8**, **AC-11**, **AC-12**
3. [ ] Sign in and recovery: sign in form with the forfeit note, forgot password by code with sessions revoked then a sign in; tests, satisfies **AC-5**, **AC-7**, **AC-10**
4. [ ] Abuse guards and hook: BotID on every auth POST in the route and in `src/instrumentation-client.ts`; Better Auth `rateLimit` with the Upstash `consume` storage and `customRules` (anonymous sign in off); the per email limit on the email check; `onAccountVerified` from the user create and update hooks; tests, satisfies **AC-15**, **AC-16**
5. [ ] More prompts: the save prompt card after a guest's ready report, and a Sign up action on `runs_daily`, `chat_daily`, `chats_daily` notices and the guest short balance card; `/design` showcase entries; e2e of sign up from the save prompt with axe clean, satisfies **AC-1**
6. [ ] Delete account: menu item, dialog with typed email, `/api/account/delete` with the email check and Better Auth's fresh session rule; in flight writes drop cleanly for a missing user; integration test of the cascade, satisfies **AC-13**, **AC-18**
7. [ ] Daily purge: `purgeUsers` (stale guests by last activity, skipping holds and generating reports, batches of 50, 120 second budget, forfeited credits logged) in `src/db/queries/users.ts`; `runDailyJobs` beside the billing sweeps in the cron route; integration test on a Neon branch, satisfies **AC-14**

**Later milestone: Google sign in** (start once the Google OAuth client exists; until then the Google button is never rendered)

8. [ ] Google: `socialProviders.google` with `mapProfileToUser`, account linking with `trustedProviders: ["google"]`, the Google button with `isInAppBrowser` and the hint, `callbackURL` back to the chat, `GOOGLE_*` env (button hidden when unset), the `/sign-in/social` rate limit and BotID entry; tests for `isInAppBrowser` and linking, satisfies **AC-4**, **AC-9**

## Consequences

**Positive**:

- Every account has a real, verified email, which spec 0004's grants and the Luna import rely on, and nobody can claim an email they don't control.
- The guest is always carried over, because the account is created in the same tab that holds the guest cookie (or Google's OAuth state).
- No new paid service beyond Resend (already chosen in spec 0001) and a free Google OAuth client; no migration.
- Spec 0001's 30 day guest retention promise is finally kept.

**Negative / tradeoffs**:

- The email sign up takes three steps (details, code, done) and a small custom route for setting the password, instead of Better Auth's one call sign up.
- A user who closes the tab between the code and the password has an account with no password until they use Forgot password.
- The email check reveals whether an email has an account (AC-8), limited per IP and per email.
- Google is unavailable inside in app browsers, where many links from social apps open.
- A guest on two devices links only the device they signed up on; the other device's guest data is purged after 30 days.
- Code emails depend on Resend deliverability; a slow or spam filed email stalls email sign up (resend and Google soften it).
- Rate limits live in Upstash and fail open, so a Redis outage removes them for its duration.
- A purge backlog right after launch can take several days to clear at 50 per batch within 120 seconds.

**Neutral**:

- The cron route now runs two job groups; the billing AGENTS.md note about adding sweeps to `runBillingCron` changes to `runDailyJobs`.
- Spec 0004 milestone 4 gets a ready hook point (`onAccountVerified`) instead of wiring Better Auth itself.
- Spec 0008's notices gain a Sign up action for guests; its limits are unchanged.
- Code sign in (`/sign-in/email-otp`) also works for an existing account; it proves the email like a reset does, so it is allowed but not offered in the UI.

## Follow-up

- [x] Resend: sending only keys per environment as `RESEND_API_KEY`, and `EMAIL_FROM`, set in Vercel for Production and Preview (2026-11-22).
- [ ] Google milestone: create the Google OAuth client and consent screen, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in Vercel, then build step 8.
- [ ] Feature #18: list Resend and Google as processors, and describe the 30 day guest cleanup.
- [ ] Spec 0004 milestone 4: plug `claimPendingGrants` into `onAccountVerified` and add the credit amount to the after sign up toast.
- [ ] `src/auth/AGENTS.md`: record that accounts are created only by the code sign in (never re enable `/sign-up/email`), the hook seam, the BotID path list, and the auth rate limit storage (`/sync` after the build).
- [ ] Install the official `resend/react-email` Agent Skill (its install failed on a registry fetch error during design) and record it with `resend` and `email-best-practices` in `src/auth/AGENTS.md` or a new `src/email/AGENTS.md`.
- [ ] Revisit email change and a signed in chat list (#14) later; both are out of scope here.
