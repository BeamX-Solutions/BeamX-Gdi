# Verify: Accounts & sign up to save · spec 0009 · updated 2026-11-23
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This pass covers build plan tasks 4 and 5 (AC-1, AC-15, AC-16); delete account, the purge and Google add their steps when built._

## UI / manual
- [ ] As a guest, finish a Stellar run until the report is ready → a "Save your report" card shows under the View report card → AC-1
- [ ] Tap Sign up on the save card → the auth dialog opens on "Create your account" over the same chat (a bottom sheet at 360px wide); closing it returns to the same chat → AC-1
- [ ] Tap Not now on the save card → it hides; reload the chat in the same tab → it stays hidden; open the chat in a new tab → it shows again (`sessionStorage` per chat) → AC-1
- [ ] Sign up from the save card with a new email and the emailed code → toast "You're signed in. Your work is saved.", same chat URL, report still there, save card gone → AC-1, AC-6
- [ ] As a signed in user, open a chat with a ready report → no save card → AC-1
- [ ] As a guest, hit the `runs_daily`, `chat_daily` and `chats_daily` notices (lower `LIMIT_*` in env) → each shows Sign up as the main button and Got it beside it; Sign up opens the dialog on sign up; Got it dismisses → AC-1
- [ ] As a signed in user, hit a daily limit notice → only Got it, no Sign up → AC-1
- [ ] As a guest without enough credits for a run → the short balance card says "Sign up for a free account to keep going…" with a Sign up button that opens the dialog → AC-1
- [ ] As a guest out of free messages (`chat_credits_guest`) → Sign up beside Got it, copy no longer says accounts are "coming soon" (added beyond AC-1's list, see the build report) → AC-1
- [ ] `/design` → the "Sign up prompts" block shows the save card, a guest notice with two buttons, and the guest short balance card; axe clean in both themes → AC-1
- [x] On a Vercel preview with Require Log In off, send a plain `curl -X POST` (no BotID headers) to `/api/auth/sign-in/email`, `/api/auth/email-otp/send-verification-otp`, `/api/auth/sign-in/email-otp`, `/api/auth/email-otp/request-password-reset`, `/api/auth/email-otp/reset-password`, `/api/account/email-check`, `/api/account/set-password` → each answers `403 {"code":"bot"}` → AC-15
- [x] On the preview, sign in normally in the browser (BotID script loaded) → works, so every protected path is in `instrumentation-client.ts` → AC-15

## Commands
- [x] `pnpm vitest run src/auth/rate-limit.test.ts` → the 6th sign in a minute from one IP is refused, the 4th email check of one email in an hour is refused, no IP skips the IP limit, Redis down allows and logs `limit_check_failed` → AC-15
- [x] `pnpm vitest run src/auth/account-verified.test.ts` → hook runs for verified non guests only, twice is harmless, a throwing hook is logged and never throws → AC-16
- [ ] `pnpm vitest run src/auth/sign-up.int.test.ts --testTimeout=120000` → the code sign in logs `account_verified` for the new user and never for the guest → AC-16
- [x] On a preview with Upstash, send 6 wrong `POST /api/auth/sign-in/email` within a minute from one IP → the 6th answers `429 {"code":"rate_limited"}` and the dialog says "Too many tries, wait a minute." → AC-15
- [ ] Same for 4 `POST /api/auth/email-otp/send-verification-otp` in a minute → the 4th is `429` → AC-15
- [ ] Check one email 4 times within an hour through `POST /api/account/email-check` (from different IPs if you can) → the 4th is `429`; the Redis key is `auth:email-check:<sha256>` with no email in it → AC-8, AC-15
- [ ] Sign in as a guest 10 times in a minute from one IP → Better Auth never answers `429` (only spec 0008's daily guest cap applies) → AC-15
- [ ] With Upstash unreachable (wrong token on a preview), sign in → it works and logs `limit_check_failed` with `auth_rate_limit` → AC-15
- [ ] Sign up a new account on a preview and read the runtime logs → one `account_verified` line with the new user id; set the password → another, harmless → AC-16
- [ ] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm exec playwright test e2e/flow.spec.ts e2e/limits.spec.ts e2e/design.spec.ts` → green (locally, use a fresh IP day or no Upstash, see the guest grant note below) → AC-1, AC-6

## Value sourcing checks
- [ ] AC-1 "is a guest": sign in, then open a chat that showed prompts as a guest → prompts are gone without a reload of the session row (`session.user.isAnonymous`)
- [ ] AC-1 "save prompt shows": a report still generating shows no save card; it appears only once the panel shows the ready report; dismiss state is per chat id
- [ ] AC-15 "client IP": `x-forwarded-for` with one address limits by that address; with no header (local `next start` without a proxy) the IP limits are skipped, never one shared bucket
- [ ] AC-16 "verified non guest": an anonymous user row update (a guest's chat activity) never logs `account_verified`

## Acceptance-criteria coverage
- AC-1: save card, notices, short balance card, signed in hides them, `/design`, e2e (UI steps 1 to 10, value checks 1 and 2)
- AC-15: BotID curl checks, the limit commands, the guest sign in exemption, fail open (UI steps 11 and 12, commands 1, 4 to 8, value check 3)
- AC-16: unit and integration tests, the preview log check, the guest exemption (commands 2, 3, 9, value check 4)

## Known local gap
- Local e2e runs share one loopback IP with the real Upstash in `.env`, so spec 0004's guest starting credit cap per IP per day runs out after a few flow runs, and later guests get 0 credits ("Not enough credits"). CI has no Upstash, so it is unaffected. Lift `grants.guestPerIpPerDay` for e2e, or run with the Upstash vars unset.

# Verify: delete account and the daily purge · spec 0009 · updated 2026-11-23
_Build plan tasks 6 and 7 (AC-13, AC-14, AC-18). Google adds its steps when built._

## UI / manual
- [x] Signed in, open the account menu → it shows Delete account under Sign out → AC-12, AC-13
- [x] Tap Delete account → a dialog (a bottom sheet at 360px) says it can't be undone and lists all your chats, all your reports, your unspent credits, then asks you to type your email → AC-13
- [x] Type a different email and tap Delete my account → "That email doesn't match your account." and nothing is deleted → AC-13
- [x] Type your email in other letter case → the account is deleted, you land on `/` with an empty chat, and the toast says "Your account was deleted." → AC-13
- [ ] After that, press Back or open an old chat URL → `404`, nothing of the account shows; the next send makes a fresh guest → AC-13, AC-18
- [x] With a session older than a day (set `session.created_at` back 2 days on a test branch), try to delete → the dialog switches to "Sign in again first"; enter the password → back to the confirm step, and the delete works → AC-13
- [ ] On that sign in again step, Sign out → you land on `/` signed out → AC-13
- [ ] Start a report, delete the account while it is generating → the delete works, and the runtime logs show the report step stopping (`stale_attempt`) with no 500 → AC-13
- [x] Sign in as account A, copy a chat URL, sign in as account B in another browser, open it → `404` → AC-18
- [x] On a preview with Require Log In off, `curl -X POST` `/api/account/delete` with no BotID headers → `403 {"code":"bot"}` → AC-15
- [x] `curl -X POST /api/auth/delete-user` with a valid session cookie → `404` (only our route deletes) → AC-13

## Commands
- [x] `pnpm vitest run src/auth/delete-account.test.ts src/components/auth/auth-copy.test.ts` → typed email check and delete copy pass → AC-13
- [ ] `pnpm test:integration src/auth/delete-account.int.test.ts` (on a throwaway branch) → wrong email `403`, guest `401`, stale session `400 SESSION_EXPIRED`, fresh delete cascades chats, runs, credits and sessions, clears the cookie, late `markReady` is `stale_attempt`, late usage saves with null ids; another account's chat is `not_found` → AC-13, AC-18
- [x] `pnpm vitest run src/lib/batches.test.ts src/billing/cron.test.ts` → batches stop on a short batch or a spent budget; a throwing job still lets the other run and answers 200 → AC-14
- [ ] `pnpm test:integration src/db/queries/purge.int.test.ts` → a guest idle 31 days goes with its chats, runs and credits; idle 29 days, an active hold, a recent session, and a verified account all stay; a spent budget deletes nothing → AC-14
- [x] `curl -H "Authorization: Bearer $CRON_SECRET" <preview>/api/cron/billing` → `200 {"billing":{...},"purge":{"deleted":..,"forfeitedCredits":..,"batches":..,"complete":true}}`, and the logs have one `guests_purged` line with counts only → AC-14
- [x] Same call without the header → `401` and nothing runs → AC-14

## Value sourcing checks
- [ ] AC-13 "fresh session": a session 23 hours old deletes; one 25 hours old gets `SESSION_EXPIRED` (counted from `session.created_at`, not `updated_at`)
- [ ] AC-14 "guest last activity": a guest whose user row and chats are 31 days old but who has a session updated today stays; one with only a run updated 10 days ago stays
- [ ] AC-14 "in flight work": a stale guest with an active `credit_hold` stays; once the hold is released, the next purge deletes it
- [ ] AC-14 "credits forfeited": a stale guest with 100 credits adds 100 to `forfeitedCredits` in the log line

## Acceptance-criteria coverage
- AC-13: menu, dialog copy, mismatch, case insensitive match, sign in again, late work, BotID, blocked `/delete-user` (UI 1 to 8, 10, 11; commands 1, 2; value check 1)
- AC-14: purge batches, budget, keeps and deletes, cron wiring and auth (commands 3 to 6; value checks 2 to 4)
- AC-18: cross account `404` (UI 9; command 2)
