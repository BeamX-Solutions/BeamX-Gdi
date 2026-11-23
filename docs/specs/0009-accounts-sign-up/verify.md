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
- [ ] On a Vercel preview with Require Log In off, send a plain `curl -X POST` (no BotID headers) to `/api/auth/sign-in/email`, `/api/auth/email-otp/send-verification-otp`, `/api/auth/sign-in/email-otp`, `/api/auth/email-otp/request-password-reset`, `/api/auth/email-otp/reset-password`, `/api/account/email-check`, `/api/account/set-password` → each answers `403 {"code":"bot"}` → AC-15
- [ ] On the preview, sign in normally in the browser (BotID script loaded) → works, so every protected path is in `instrumentation-client.ts` → AC-15

## Commands
- [ ] `pnpm vitest run src/auth/rate-limit.test.ts` → the 6th sign in a minute from one IP is refused, the 4th email check of one email in an hour is refused, no IP skips the IP limit, Redis down allows and logs `limit_check_failed` → AC-15
- [ ] `pnpm vitest run src/auth/account-verified.test.ts` → hook runs for verified non guests only, twice is harmless, a throwing hook is logged and never throws → AC-16
- [ ] `pnpm vitest run src/auth/sign-up.int.test.ts --testTimeout=120000` → the code sign in logs `account_verified` for the new user and never for the guest → AC-16
- [ ] On a preview with Upstash, send 6 wrong `POST /api/auth/sign-in/email` within a minute from one IP → the 6th answers `429 {"code":"rate_limited"}` and the dialog says "Too many tries, wait a minute." → AC-15
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
