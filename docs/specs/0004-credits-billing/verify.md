# Verify: credits & billing · spec 0004 · updated 2026-11-19

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Built so far: milestone 1 tasks 1 to 3 (billing core: config, pricing, migration, credit queries, charge and release wired into reports, runs and conversations), plus the guest link move and merge from task 17. The UI and assistant steps arrive with tasks 4 and 5, after feature #7.

## Commands

- [x] `pnpm test` → the 16 tests in `src/billing/pricing.test.ts` pass (chat charge rounding, minimum 1 and ceiling; covering packs; Lagos day boundary at 23:00 UTC; calendar month expiry and the 30 day warning) → AC-9, AC-10, AC-15, AC-18
- [x] `pnpm test:integration` against a throwaway Neon branch → all pass, including `credits.int.test.ts` → AC-3, AC-4, AC-5, AC-7, AC-11, AC-12, AC-19, AC-20
- [x] `pnpm db:generate` → "No schema changes" (schema and migrations agree)
- [x] Query the migrated DB: tables `credit_account`, `credit_hold`, `credit_ledger`; the 9 `credit_*` CHECK constraints; partial unique indexes `credit_hold_one_active_per_run` and `credit_hold_one_per_message`; `credit_hold.run_id` deletes by CASCADE; `SELECT billing_assert(false, 'insufficient_credits')` raises `P0001` with that message → AC-3, AC-19, AC-20

## Behaviour (each covered by an integration test today)

- [x] Two parallel approvals of 30 on a 40 balance → exactly one hold; the other gets `insufficient_credits` with `available: 10`; no orphan run → AC-3
- [x] A short balance starts nothing: no run, no hold → AC-3
- [x] Report ready → one `run_charge` entry, balance and held both drop by the price; a replay or a stale attempt changes nothing → AC-4
- [x] Hold released mid flight → `markReady` returns `no_credit_hold` and the attempt is `failed` (never ready for free); `claim` is refused until credits are held again → AC-4, AC-7
- [x] Hold kept through report attempts 1 and 2, released after attempt 3 fails; balance unchanged → AC-5
- [x] Abandoning a run, or deleting its conversation, releases its hold → AC-5
- [x] Resuming a paused run whose hold was released holds today's price together with the resume; a short balance resumes nothing and the run stays paused → AC-7
- [x] Starter grant written once (second `ensureAccount` changes nothing); a capped guest gets an account with 0 and no ledger entry → AC-11
- [x] Guest link into a brand new account moves balance, holds and ledger; into an existing account the spare free credits are forfeited (`guest_grant_forfeit`), the held credits move, and the moved run is still charged correctly → AC-12
- [x] Deleting a user with an active hold succeeds and removes their credit account, ledger and holds → AC-19
- [x] After every scenario: sum of ledger equals balance, and held equals the sum of active holds → AC-20

## Value sourcing checks

- [x] Price held equals the `price` argument (the server price), never a client value; a changed price on resume holds the new amount → Value sourcing: price to hold
- [x] `available` = `balance − held`; 0 when no account exists → Value sourcing: available balance
- [x] `balance_after` on each ledger entry equals the account balance right after it → Value sourcing: `balance_after`
- [x] Starter grant amount comes from the caller (30, or 0 when capped) → Value sourcing: starter grant amount
- [x] Lagos date flips at 23:00 UTC, not at UTC midnight → Value sourcing: today's date for the allowance

## Acceptance criteria coverage

- Covered now: AC-3, AC-4, AC-5, AC-7 (query layer), AC-11 (grant only; IP cap with task 9), AC-12, AC-18 (config and pricing), AC-19 (credit rows), AC-20 (SQL invariants; daily drift job with task 19)
- Not yet built: AC-1, AC-2, AC-8, AC-14, AC-21 (tasks 4 and 5, after #7) · AC-6, AC-9, AC-10 (milestone 2) · AC-13 (milestone 3) · AC-15, AC-16, AC-17 (milestone 4)

## Milestone 2: hold lifecycle and paid chat · updated 2026-11-22

### UI / manual
- [ ] As a signed in user (or a guest), send 10 typed messages (5 as a guest) with no run in progress → each is free; Upstash shows `billing:free-chat:<userId>:<lagosDate>` counting up; no `chat_charge` ledger entry → AC-9
- [ ] The reply that uses the last free message ends with "That was your last free message today"; send another and the card does not appear again that day → AC-9
- [ ] The next typed message holds 3 (`credit_hold` purpose `chat`, `active`), then charges 1 to 3 credits: one `chat_charge` entry, the hold `charged`, and the header chip drops by the charge without a reload → AC-10
- [ ] With a run in progress, type a side question past the allowance → no hold, no charge, the free counter does not move → AC-9
- [ ] With fewer than 3 credits available past the allowance, a typed message gets "Not enough credits to keep chatting" (a guest: "You've used today's free messages"), no AI call, nothing saved; Got it puts the text back → AC-10, AC-21
- [ ] Force an AI error on a paid message (bad `ANTHROPIC_API_KEY` in dev) → the hold is released as `chat_error`, nothing charged → AC-10
- [ ] With Upstash unset in dev, close the tab before any text arrives on a paid message → the hold is released, nothing charged; close it after text started → 1 or more credits charged → AC-10
- [ ] With Upstash set, close the tab mid reply on a paid message, then reopen the chat → the reply resumes or shows in full, the ledger shows exactly one `chat` charge for the finished reply, and the chat hold is `charged`, not `released` → AC-10 (Redis down is covered by the `resumable.test.ts` drain test, not by hand)
- [ ] Point `UPSTASH_REDIS_REST_URL` at a dead host and send a typed message → it is treated as paid (holds 3 if the balance covers it, else the short balance card), never a 500 → AC-9
- [ ] Four new guests from one IP approve a run in the same Lagos day → the first three get 30 credits, the fourth gets an account with 0 and sees the guest short balance card; `billing:guest-grant:<ip>:<lagosDate>` reads 3 → AC-11
- [ ] Pause a run, set its `tool_run.updated_at` 31 days back, call `GET /api/cron/billing` with `Authorization: Bearer $CRON_SECRET` → `{ releasedIdle: 1 }`, the hold `released` (`idle`); resuming shows the confirm card at today's price, and the answers are kept → AC-7
- [ ] Same call without the header, or with a wrong token → 401, nothing released → AC-7
- [ ] Place a chat hold and set its `created_at` 16 minutes back, then call the cron → released as `chat_error` → AC-10
- [ ] Open `/design` → the Limit notices block also shows the two short balance notices and the last free message card; Got it dismisses each → AC-9, AC-10

### Commands
- [ ] `pnpm test src/billing src/assistant/chat-api.test.ts src/components/workspace/chat-view.test.ts src/lib/env.test.ts` → all pass → AC-9, AC-10, AC-11, AC-21
- [ ] `pnpm test:integration src/db/queries/credits.int.test.ts` on a throwaway Neon branch → the chat hold, sweep, and "phased report is charged once" cases pass → AC-6, AC-7, AC-10
- [ ] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e e2e/limits.spec.ts` → the two new notices render, pass axe, and give the text back → AC-10, AC-21

### Value sourcing
- [ ] Today's date for the allowance: a message at 22:59 UTC counts on today's key, one at 23:00 UTC on tomorrow's (`chat-billing.test.ts`) → AC-9
- [ ] Free messages left: `freePerDay` (10 account, 5 guest) minus the Redis count; the reply metadata carries `freeLeft` → AC-9
- [ ] Run in progress: only `tool_run.status = 'in_progress'` in this chat exempts a message; a paused run does not → AC-9
- [ ] Ceiling to hold: `billingConfig.chat.ceilingCredits` (3); changing it changes new holds only → AC-10, AC-18
- [ ] Credits charged: `chatCharge(costUsd)` over the turn's `ai_usage` cost; a charge never exceeds the hold → AC-10
- [ ] Notice shown today: `billing:free-notice:<userId>:<lagosDate>` set once (48 hour expiry) → AC-9
- [ ] Starter grant amount: 30, or 0 when the IP counter is at 3; signed in users and guests with no IP are never capped → AC-11

### Known gap
- Stop with resumable streams on (Upstash set, so production): the server tees the stream into Redis and keeps generating after a client Stop, so the turn ends cleanly and is charged as a finished reply. "Stop before any output costs nothing" holds only where resumable streams are off. Decided 2026-11-22: this is the intended behaviour, there is no chat Stop (AC-10 updated).

### Acceptance criteria coverage (milestone 2)
- AC-2 (resume `price_changed`), AC-7 · manual idle sweep steps · credits integration tests · `resume-run` tool (built with spec 0006)
- AC-6 · "a phased report is charged once" integration test
- AC-9 · manual free steps · chat-api and chat-billing tests · value sourcing rows
- AC-10 · manual paid, error, Stop and sweep steps · chat-api, chat-billing and credits integration tests (Stop gap above)
- AC-11 (IP cap) · manual four guests step · chat-billing tests
- AC-21 · short balance notices in e2e and chat-view tests

## Milestone 4: accounts and money operations · updated 2026-11-23

Built: tasks 15 to 18, and task 19's expiry job, drift check and chip warning dot. The `/credits` expiry banner and the `/credits` page claim call wait for the `/credits` page (milestone 3, task 14).

### Commands

- [ ] `pnpm test` → `money-ops.test.ts` (email hash, Luna CSV, adjust arguments), `summary.test.ts` (warning dot), `cron.test.ts` (expiry and drift jobs), `chat-billing.test.ts` (a signed in user claims grants), `account-verified.test.ts` (claim failure logged, never thrown), `env.test.ts` (`BILLING_HASH_SECRET`) pass → AC-11, AC-15, AC-16, AC-17, AC-20
- [ ] `pnpm test:integration` on a throwaway Neon branch (CI) → `money-ops.int.test.ts` and `link.int.test.ts` pass (the FK coverage test sees `luna_credit_import` as excluded) → AC-11, AC-12, AC-15, AC-16, AC-17, AC-19, AC-20
- [x] Migrated dev: tables `signup_grant_claim` (2 columns) and `luna_credit_import` (7 columns), with `luna_credit_import_claim_time`, `_email_normalized`, `_credits_positive`, `_luna_positive`, the email unique key, and the user FK `ON DELETE SET NULL` → AC-16, AC-19
- [x] `pnpm db:generate` → "No schema changes"
- [x] `pnpm credits:adjust a@b.co 5 --actor s@b.co` → "--reason is required", exit 2; an unknown email → `user_not_found`, exit 1 → AC-17
- [x] `pnpm credits:import-luna <csv with a bad line>` → "Nothing imported" with the line number; a good file answered `n` → "Cancelled, nothing imported" → AC-16
- [ ] `pnpm credits:adjust <dev email> 10 --reason "verify" --actor <staff email>` → shows the change, asks, writes one `adjustment` row with that reason and actor; `-<more than available>` → `would_go_below_held`, nothing written → AC-17
- [ ] `GET /api/cron/billing` with the bearer token → body has `expiry: { enforced: false, due, expired: 0, credits }` and `drift: { drifted: 0 }`; logs `credit_expiry` → AC-15, AC-20

### UI / manual (preview with `BILLING_HASH_SECRET` set)

- [ ] As a guest, approve a Stellar run (30 held), then sign up with a new email → the chip shows 30 + 50 available (held 30 moves with the run); `/c/<id>` still finishes the run and charges it → AC-11, AC-12
- [ ] Sign up with a brand new email, never a guest → chip shows 80 after the first paid action, or ledger shows `starter_grant` 30 + `signup_grant` 50 right after sign up → AC-11
- [ ] Delete that account, sign up again with the same email → only the 30 starter grant, no second `signup_grant` → AC-11, AC-19
- [ ] Import a CSV with a test email at 3 Luna credits, then sign up with it → one `luna_import` of 30; signing in again adds nothing → AC-16
- [ ] Set a test account's `last_activity_at` back 11 months 5 days (SQL on the preview branch) → reload, the chip shows the warning dot, read out as "Your credits expire soon"; at 10 months, no dot → AC-15

### Value sourcing checks

- [ ] Sign up grant: `billingConfig.grants.signup` (50) only when the `signup_grant_claim` insert is new; email hash is HMAC SHA256 of the lowercased, trimmed email (`" Ada@X.co "` and `"ada@x.co"` claim once between them) → AC-11
- [ ] Luna credits: `luna_credit_import.credits` (= `luna_credits × 10`), matched on the lowercased email, only when `user.emailVerified` (an unverified user claims nothing) → AC-16
- [ ] Expiry date: Lagos date of `last_activity_at` + 12 calendar months (a 31 Jan activity expires on 28 or 29 Feb a year on); grants and adjustments don't move `last_activity_at`, a Luna claim does → AC-15
- [ ] Warning: on from expiry − 30 days on the Lagos date (23:30 UTC already counts as the next day) and only with a balance above 0 → AC-15
- [ ] Adjust actor and reason: from the required `--actor` and `--reason` flags, stored on the row → AC-17

### Acceptance criteria coverage (milestone 4)
- AC-11 (sign up grant, once per email ever) · `money-ops.int.test.ts` claim tests · manual sign up steps
- AC-12 (link after the hook's grants) · "guest link after the sign up grant" integration test · manual guest sign up step
- AC-15 · expiry integration tests, `summary.test.ts`, `cron.test.ts` · warning dot step (banner owed with `/credits`)
- AC-16 · Luna integration tests, `parseLunaCsv` tests · import script steps
- AC-17 · adjust integration tests, `parseAdjustArgs` tests · adjust script steps
- AC-19 · deletion keeps `signup_grant_claim` and a claimed import stays claimed (integration) · `payment` rows come with milestone 3
- AC-20 · `findDrift` integration test, `runDriftCheck` unit test · cron step

## Milestone 3: buying credits · updated 2026-11-23

Built: tasks 11 to 14 (payment table, Paystack client, checkout Server Action, callback, webhook, stale pending sweep, Buy on the short balance card, `/credits` page) and the `/credits` expiry banner from task 19. Use the Paystack TEST key (`sk_test_...`) and test card `4084 0840 8408 4081` (any future expiry, CVV `408`, PIN `0000`, OTP `123456`). For the webhook locally, expose the dev server (for example with a tunnel) and set that URL in the Paystack test dashboard, or skip the webhook steps locally and run them on a preview.

### UI / manual
- [ ] As a signed in account with fewer credits than a tool's price, approve a run → the short balance card shows the shortfall and a Buy button per covering pack → AC-8
- [ ] Tap Buy on a pack → the button says "Opening Paystack…", the browser goes to `checkout.paystack.com`, amount ₦ matches the pack → AC-8, AC-13
- [ ] Pay with the test card → you land back on the same `/c/<id>` with a "Payment received" toast, `?payment=` is gone from the address bar, the header chip shows the new balance; approve again and the run starts → AC-8, AC-13, AC-14
- [ ] On Paystack, cancel instead of paying → you land on `/credits?payment=failed` or `pending` with a friendly banner, nothing is granted → AC-13, AC-21
- [ ] As a guest, the short balance card shows Sign up, never Buy; `/credits` says sign up to buy → AC-8, AC-13
- [ ] Tap the header chip → `/credits` shows available, held, expiry date, the three packs with Buy, and the history newest first; with more than 20 entries, Older and Newest page through without repeats → AC-14
- [ ] Set an account's `last_activity_at` to 11.5 months ago on the dev branch → `/credits` shows the "Your credits expire soon" banner with the right date and the chip shows the warning dot → AC-15
- [ ] Unset `PAYSTACK_SECRET_KEY` and tap Buy → the line "Payments are unavailable right now… You were not charged." shows under the buttons, no error page → AC-21
- [ ] Tap Buy 11 times within an hour (with Upstash set) → the 11th shows the rate limited line → AC-13, AC-21

### Commands
- [ ] `curl -i -X POST -H "x-paystack-signature: abc" -d '{"event":"charge.success"}' http://localhost:3000/api/webhooks/paystack` → `401 {"code":"unauthorized"}`, nothing changes → AC-13
- [ ] `curl -i "http://localhost:3000/credits/callback?reference=<uuid>"` with no session → `303` to `/credits?payment=pending` → AC-13
- [ ] Open `/credits/callback?reference=<another user's payment id>` signed in → lands on `/credits?payment=not_found`, nothing is shown about that payment → AC-13
- [ ] After a test payment, `SELECT count(*) FROM credit_ledger WHERE payment_id = '<id>'` → exactly 1, even though both the webhook and the callback ran (check the logs for `payment_succeeded` once) → AC-13
- [ ] Create a pending payment, set its `created_at` to 2 hours ago, call `/api/cron/billing` with the bearer token → the response has a `payments` job with `checked >= 1`; at 25 hours old with no success it becomes `abandoned` → AC-13
- [ ] `pnpm test:integration` on a throwaway branch → `payments.int.test.ts` passes (grant once under a race, amount mismatch grants nothing, late success after abandoned, payment kept with a null user after deletion, history keyset paging) → AC-13, AC-14, AC-19

### Value sourcing checks
- [ ] Paystack amount: for each pack, the `payment.amount_kobo` row equals `priceNgn × 100` (₦10,000 → 1000000), never a value from the browser
- [ ] Credits to grant: edit a pack's credits in `billing/config.ts` after a checkout started, then finish paying → the grant uses the `payment.credits` copied at checkout
- [ ] Amount check: a webhook (validly signed) whose `amount` differs from `payment.amount_kobo` → no grant, `payment_amount_mismatch` logged
- [ ] Callback URL: the Paystack page's return goes to `NEXT_PUBLIC_APP_URL/credits/callback?returnTo=<chat id>`; a `returnTo` that is not your chat sends you to `/credits` instead
- [ ] Expiry date: an account with `last_activity_at` at 23:30 UTC on 31 January shows the Lagos date plus 12 months (1 February next year, not 31 January)

### Acceptance criteria coverage
- AC-8 · Buy on the card and land back in the chat (manual), guest variant
- AC-13 · `checkout.test.ts`, `paystack.test.ts`, `payments.int.test.ts` · webhook 401, callback, race, mismatch, sweep steps
- AC-14 · `/credits` page and history paging (manual), `history.test.ts`, keyset integration test
- AC-15 · `/credits` expiry banner step (closes the banner owed above)
- AC-19 · payment kept with a null user (integration)
- AC-21 · unavailable and rate limited lines, failed and not found banners
