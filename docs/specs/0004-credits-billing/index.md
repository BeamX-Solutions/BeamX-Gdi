# 0004. Credits and billing for the BeamX Workspace

**Date**: 2026-11-19
**Status**: Accepted

## Summary

Clients pay for tool runs and longer chats from one credit balance (1 credit is worth ₦100), topped up with Paystack in naira. The assistant always asks before spending. A run's price is set aside (held) when the client says yes, taken only when the report arrives, and given back if the report fails, so a failed run costs nothing. Chat is free up to a daily allowance, then costs the real AI cost rounded up to whole credits, never more than a small ceiling. Every movement of credits is written to an append only ledger (a history that is never edited), so the balance can always be explained and checked.

## Requirements

**User stories**:
- As a client, I want to see what a tool costs and say yes before anything is spent, so I am never charged by surprise.
- As a client, I want a failed report to cost me nothing, and a retry never to ask me to pay again.
- As a guest, I want enough free credits to see one real report before I sign up.
- As a client, I want to buy credits with Paystack without losing my place in the chat.
- As a client, I want to see my balance, what each credit was spent on, and when my credits expire.
- As a Luna client, I want my existing Luna credits to appear in the workspace when I sign up with the same email.
- As BeamX staff, I want to grant or correct credits with a clear record of who did it and why.

**Acceptance criteria**:
- **AC-1**: Before any tool run starts, the chat shows a confirm card with the tool's price and the client's available balance (balance minus held). The run starts and credits are held only after the client approves. Declining starts nothing and holds nothing.
- **AC-2**: The server always uses the current server side price, never one sent by the client. If the price on the card the client approved differs from the current price, nothing is held, and the card is shown again with the new price (`price_changed`).
- **AC-3**: A hold succeeds only if available balance ≥ price. Two approvals racing for the same credits never both succeed: at most one is held, and the other gets `insufficient_credits`. A paid run and its hold are created together or not at all.
- **AC-4**: When a run's report becomes `ready`, its hold is charged exactly once, in the same database commit as the report turning ready. The charge writes one `run_charge` ledger entry with `balance_after`. A replayed or stale report attempt never charges again.
- **AC-5**: While a report has retries left, its hold stays and "Try again" never asks to pay again. The hold is released (nothing charged) when all 3 attempts fail or the run is abandoned.
- **AC-6**: A Luna plan that fails partway and resumes from the failed phase is charged once, when the whole plan is ready.
- **AC-7**: A daily job releases the hold of any run with no activity for 30 days. When the client resumes such a run, the confirm card appears again at today's price, and their answers are kept. No report generation ever starts for a run without an active hold.
- **AC-8**: If the client approves but is short, the card shows how many credits are missing and the packs that cover the shortfall. A signed in client can buy from the card through Paystack and lands back in the same chat to approve again. A guest is asked to sign up first, and keeps the run. Nothing starts unpaid.
- **AC-9**: Each user gets free chat messages per Lagos calendar day (`Africa/Lagos`): 10 for accounts, 5 for guests. Messages sent while a run is in progress in that conversation are free and are not counted. When the last free message of the day is used, the chat shows a short notice once that day, saying chat now costs about 1 credit a message, at most the ceiling (tracked by a second Redis key, so it shows once). If Redis is unreachable, the message is treated as paid when the balance covers the ceiling, otherwise the short balance card is shown.
- **AC-10**: Beyond the allowance, the server holds the per message ceiling before calling the AI. After the reply it charges `min(ceiling, max(1, ceil(costUsd × usdToNgn × markup ÷ ngnPerCredit)))` and releases the rest. If the AI call errors, nothing is charged. There is no Stop for a chat reply. A dropped connection (a closed tab, lost signal) is never a stop: with resumable streams on (production), the reply runs to the end, is saved, can be resumed when the Redis buffer is working, and is charged like any finished reply. This holds even when the Redis buffer fails to start: the copy meant for it is then read to its end and thrown away, never cancelled. Only when resumable streams are off (`resumableEnabled` false: dev, CI) does a dropped connection cut the AI call off; then nothing is charged if no output had arrived, else the real cost so far (at least 1 credit). A chat hold still `active` 15 minutes after it was placed (timeout, disconnect, crash) is released by the daily job as `chat_error`. If available balance is below the ceiling, a short balance card is shown instead of calling the AI.
- **AC-11**: The credit account is created at the user's first billable action (approving a run, or the first paid chat message), together with a 30 credit starter grant, once per user. A guest from an IP that already received 3 guest grants that Lagos day gets an account with 0 credits, and so sees the guest variant of the short balance card (sign up prompt). The IP counter is bumped only after a grant is actually written. A 50 credit sign up grant is given once per verified email address, ever, even if that account is later deleted and the email signs up again.
- **AC-12**: When a guest links to a brand new account, the guest's balance, holds, and ledger all move to it. When a guest signs in to an account that already exists, holds and ledger history move, credits held for an unfinished run move so the run can still finish, and the guest's unspent free credits are dropped with a `guest_grant_forfeit` entry.
- **AC-13**: Only a signed in (not anonymous) user can start a checkout. A successful Paystack payment grants its pack's credits exactly once, whichever arrives first: the webhook or the client's return to the callback page. A payment whose amount or currency does not match the pack grants nothing and is logged as an error. A webhook with a bad signature gets 401 and changes nothing. The daily job checks any payment still `pending` after 1 hour with Paystack, and marks one with no success after 24 hours `abandoned`.
- **AC-14**: The header shows the available balance (0 for a signed in user with no credit account yet; hidden for a guest with none). The `/credits` page shows balance, held credits, the expiry date, the packs, and the history (newest first, 20 per page, older pages by cursor).
- **AC-15**: The whole balance expires after 12 calendar months (computed with date arithmetic on `Africa/Lagos` dates, not 365 days) with no purchase, hold, charge, or Luna claim; grants and staff adjustments do not reset the clock. An account with anything held never expires (the job skips `held > 0`). The `expiry` entry is `−balance`, leaving 0. From 30 days before expiry, the header chip shows a warning dot and `/credits` shows a banner. Expiry writes an `expiry` ledger entry. Enforcement stays off (`expiry.enforce = false`) until the email reminder ships in slice 5.
- **AC-16**: The Luna import script loads a CSV of email and Luna credits into `luna_credit_import` at ×10. When a user with that verified email signs up or signs in, the credits are granted once as `luna_import`. A second claim grants nothing.
- **AC-17**: `pnpm credits:adjust` writes one `adjustment` entry with a required reason and actor, asks for confirmation, and refuses a change that would push the balance below what is held.
- **AC-18**: Tool prices come from each tool module. Packs, grants, chat allowance, metering, idle days, and expiry come from `src/billing/config.ts`. A config change affects new holds only, never a hold already placed.
- **AC-19**: Deleting an account removes its credit account, ledger, and holds. Its `payment` rows remain with `user_id` null, and its `signup_grant_claim` row remains.
- **AC-20**: These always hold, enforced in SQL: `balance ≥ 0`, `0 ≤ held ≤ balance`. The daily job also checks that the sum of each user's ledger equals their balance, and that `held` equals the sum of their active holds. It computes both in one SQL statement (one snapshot), checks each hit once more, and logs `credit_drift` for any user where either still fails. It never repairs automatically; staff fix with `credits:adjust`.
- **AC-21**: Every expected billing failure (short balance, price changed, Paystack unavailable, rate limited, payment still pending) shows a friendly card or message, never a blank screen or a 500.

## Decision

**Chosen option**: Option 2: an append only ledger plus a balance row, with holds in their own table.

Each user has one `credit_account` row (balance and held amount) kept in step with an append only `credit_ledger` in the same commit. Holds live in `credit_hold`, and the Paystack checkout uses the hosted redirect plus a signed webhook, both idempotent (safe to repeat).

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `ai-elements` (`vercel/ai-elements`, `.claude/skills/ai-elements/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `upstash-redis-js` (`upstash/skills`, `.claude/skills/upstash-redis-js/`) · `upstash-ratelimit-js` (`upstash/skills`, `.claude/skills/upstash-ratelimit-js/`) · `better-auth-best-practices` (`.claude/skills/better-auth-best-practices/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `vercel-schedules` (`vercel/vercel-plugin`, `.agents/skills/vercel-schedules/`, symlinked into `.claude/skills/`; use plain `vercel.json` crons as specified, not the newer Schedules product)

**Decisions made in design** (pick, why, runner up):
- **Module home**: a new `src/billing/` module holds the typed config, the pure pricing functions, and the Paystack client. The SQL lives in `src/db/queries/credits.ts` and `payments.ts`. Orchestration stays at the edges (the assistant's tools, the chat route's `onFinish`, Server Actions, route handlers). Why: matches spec 0001's pure core, effects at the edges. Runner up: putting it in `src/lib/`, which would mix money logic with generic helpers.
- **Atomic guard**: the migration adds a tiny SQL function `billing_assert(ok boolean, code text)` that raises (SQLSTATE `P0001`, message = `code`) when `ok` is false. A batch that must be all or nothing (start run plus hold, resume plus hold) ends with an assert, so a failed hold aborts the whole batch. The query layer maps the code to a typed error. Why: `neon-http` has no interactive transactions, but a `db.batch` is one transaction, so a raised error rolls everything back, and the existing, tested `runs.start` / `runs.resume` statements (pause the other run, insert, partial unique index retry) are reused unchanged. Runners up: one chained statement that makes the run insert depend on the hold (rejected in cross check: the pause and the insert in one statement have no defined order against the partial unique index), and creating the run then marking it abandoned (leaves junk rows and pauses the client's other run for nothing).
- **Conditional writes in one statement**: each hold, charge, and release is one statement using a data modifying CTE (`WITH ... UPDATE ... RETURNING`) or a guarded `UPDATE ... WHERE balance - held >= $amount`, so the check and the write cannot be split by a race. Each batch ends with a SELECT so zero rows becomes the exact typed error, as in spec 0002.
- **Charge commits with the report**: `reports.markReady` becomes one chained statement: the report update (`WHERE status = 'generating' AND attempts = $attempt`) `RETURNING` feeds the hold update (`WHERE run_id AND status = 'active'`), which feeds the account update, which feeds the ledger insert. A stale attempt matches zero rows at the first step, so nothing below it runs. The statement builders live in `queries/credits.ts`. If the run has no active hold, `markReady` returns `no_active_hold` and the attempt is marked failed, so a report is never ready for free. `reports.markFailed` releases the hold in the same batch when `attempts = 3`. Why: a report marked ready but never charged (or charged but not ready) can't happen. Runner up: charging in a separate call after `markReady`, which can be lost on a crash.
- **Chat metering uses the existing cost record**: the charge comes from the same `src/lib/ai-cost.ts` price table that fills `ai_usage.cost_usd`, applied to the AI SDK `totalUsage` of the whole assistant turn (all steps). If feature #21 has not built `ai-cost.ts` yet, this feature builds it.
- **Free allowance counter**: Upstash Redis `INCR` on `billing:free-chat:<userId>:<lagosDate>` with a 48 hour expiry, counted only after a completed free reply. Two parallel messages at the edge of the allowance may both be free; that small leak is accepted. Why: no table, it cleans itself up, and Redis is already in the stack.
- **Guest grant IP cap**: Redis `INCR` on `billing:guest-grant:<ip>:<lagosDate>` (expiry 48 hours), the IP read with the same request helper feature #21 uses.
- **Starter grant for direct sign ups**: whoever creates the credit account first gets the 30 credit starter grant (the IP cap applies to guests only). So someone who signs up without ever being a guest gets 30 + 50, same as a guest who signs up.
- **Grant claiming**: the sign up grant and Luna claim run in one idempotent `credits.claimPendingGrants(userId)`, which first calls `ensureAccount` (so a direct sign up gets 30 + 50), and is called from a Better Auth database hook when a user with a verified email is created or their email turns verified. It is also called on the `/credits` page load and at the first billable action, so a hook failure (logged, never blocking sign up) heals itself.
- **Approval**: the assistant's `startRun` and `resumeRun` tools require approval through AI SDK 7 `toolApproval` (not the v6 `needsApproval`). When the approval is requested, the server writes the registry price into the tool call input as `shownPrice` (the model never chooses it), and the confirm card (spec 0003 answer card styling) renders that value. On approval, `execute` compares `shownPrice` with the registry price again; on a mismatch it returns `price_changed` and the assistant's instructions say to call the tool again, which produces a fresh card. `resumeRun` asks for approval only when the run has no active hold.
- **Chat settlement**: settle the chat hold in `onFinish` scheduled with Next.js `after()`, and handle the abort path explicitly (AI SDK `onAbort`), since `onFinish` does not fire on every abort. Whatever still slips through is released by the 15 minute chat hold sweep.
- **Payment reference**: the `payment.id` (UUID v7) is the Paystack `reference`, so the webhook, the callback, and the sweep all find the row by its primary key.
- **Keyed email hash**: `signup_grant_claim.email_hash` is HMAC SHA256 of the lowercased, trimmed email with `BILLING_HASH_SECRET`. Why: no readable email kept after deletion, and the hash can't be reversed without the server secret.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (target, all additive to spec 0002; signed off in design):

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `credit_account` | `user_id` | uuid | no | PK, FK `user.id` ON DELETE CASCADE |
| | `balance` | integer | no | default 0; CHECK `balance >= 0` |
| | `held` | integer | no | default 0; CHECK `held >= 0 AND held <= balance` |
| | `last_activity_at` | timestamptz | no | default now(); bumped by purchase, hold, charge, Luna claim |
| | `expiry_warned_at` | timestamptz | yes | written by the slice 5 email reminder |
| | `created_at`, `updated_at` | timestamptz | no | |
| `credit_ledger` | `id` | uuid | no | PK |
| | `user_id` | uuid | no | FK `user.id` ON DELETE CASCADE |
| | `kind` | `credit_entry_kind` enum (`starter_grant`, `signup_grant`, `purchase`, `run_charge`, `chat_charge`, `expiry`, `adjustment`, `luna_import`, `guest_grant_forfeit`) | no | |
| | `amount` | integer | no | signed; CHECK `amount <> 0` |
| | `balance_after` | integer | no | CHECK `>= 0`; the account balance right after this entry |
| | `hold_id` | uuid | yes | FK `credit_hold.id` ON DELETE SET NULL |
| | `run_id` | uuid | yes | FK `tool_run.id` ON DELETE SET NULL |
| | `payment_id` | uuid | yes | FK `payment.id` ON DELETE SET NULL (FK added with `payment` in milestone 3) |
| | `reason` | text | yes | required by the adjust script |
| | `actor` | text | no | default `system`; a staff email for adjustments |
| | `idempotency_key` | text | no | unique |
| | `created_at` | timestamptz | no | append only, never updated |
| `credit_hold` | `id` | uuid | no | PK |
| | `user_id` | uuid | no | FK `user.id` ON DELETE CASCADE |
| | `purpose` | `hold_purpose` enum (`run`, `chat`) | no | |
| | `run_id` | uuid | yes | FK `tool_run.id` ON DELETE CASCADE (a hold is deleted with its run; see the note under Indexes and constraints) |
| | `message_id` | uuid | yes | the assistant message id (chat holds) |
| | `amount` | integer | no | CHECK `amount > 0`; the price locked at hold time |
| | `status` | `hold_status` enum (`active`, `charged`, `released`) | no | default `active` |
| | `release_reason` | `hold_release_reason` enum (`report_failed`, `abandoned`, `idle`, `chat_error`) | yes | set only when `released` |
| | `charged_amount` | integer | yes | CHECK `charged_amount BETWEEN 1 AND amount`; set only when `charged` |
| | `created_at` | timestamptz | no | |
| | `settled_at` | timestamptz | yes | set when it leaves `active` |
| `payment` | `id` | uuid | no | PK; also the Paystack `reference` |
| | `user_id` | uuid | yes | FK `user.id` ON DELETE SET NULL (kept for accounting) |
| | `pack_id` | text | no | from billing config |
| | `credits` | integer | no | CHECK `> 0`; copied from the pack at checkout |
| | `amount_kobo` | integer | no | CHECK `> 0`; pack naira price × 100 |
| | `currency` | text | no | default `NGN` |
| | `status` | `payment_status` enum (`pending`, `succeeded`, `failed`, `abandoned`) | no | default `pending` |
| | `paystack_transaction_id` | text | yes | from verify or webhook |
| | `paid_at` | timestamptz | yes | |
| | `created_at`, `updated_at` | timestamptz | no | |
| `luna_credit_import` | `id` | uuid | no | PK |
| | `email` | text | no | lowercased, trimmed; unique |
| | `luna_credits` | integer | no | CHECK `> 0`; as exported from Luna |
| | `credits` | integer | no | `luna_credits × 10` |
| | `claimed_by_user_id` | uuid | yes | FK `user.id` ON DELETE SET NULL |
| | `claimed_at` | timestamptz | yes | CHECK `claimed_by_user_id IS NULL OR claimed_at IS NOT NULL` (a claimer always has a claim time; see the note under Indexes and constraints) |
| | `imported_at` | timestamptz | no | |
| `signup_grant_claim` | `email_hash` | text | no | PK; HMAC SHA256, no readable email |
| | `created_at` | timestamptz | no | no user link, survives deletion |

Indexes and constraints:
- `credit_ledger` index `(user_id, created_at desc, id desc)` for the history page (keyset pagination).
- `credit_hold_one_active_per_run`: unique `(run_id)` WHERE `status = 'active' AND purpose = 'run'`.
- `credit_hold_one_per_message`: unique `(message_id)` WHERE `purpose = 'chat'`.
- `credit_hold_target`: CHECK `purpose <> 'run' OR run_id IS NOT NULL OR status <> 'active'` and CHECK `(purpose = 'chat') = (message_id IS NOT NULL)`. A run hold never outlives its run: `credit_hold.run_id` is ON DELETE CASCADE, not SET NULL. Today a run is deleted only by the user cascade (a conversation delete sets `tool_run.conversation_id` to null and keeps the run). In that cascade, SET NULL could clear `run_id` on an active hold before the hold's own `user_id` cascade removes it, trip this CHECK, and abort the account deletion (AC-19). The money record is unaffected: `credit_ledger.hold_id` and `credit_ledger.run_id` stay SET NULL, so ledger entries survive their hold and run. Any future path that deletes a run alone must first release its active hold in the same batch (with `releaseRunHolds`), or `held` drifts; the daily drift check (task 19) would flag it.
- `credit_hold_settled`: CHECK `(status = 'active') = (settled_at IS NULL)`, `(status = 'released') = (release_reason IS NOT NULL)`, `(status = 'charged') = (charged_amount IS NOT NULL)`.
- `credit_hold` index `(status, purpose)` WHERE `status = 'active'` for the idle sweep.
- `payment` index `(status, created_at)` WHERE `status = 'pending'` for the sweep; index `(user_id)`.
- Function `billing_assert(ok boolean, code text)`: raises `P0001` with `code` when `ok` is false.
- `luna_credit_import_claim_time`: CHECK `claimed_by_user_id IS NULL OR claimed_at IS NOT NULL`, not "both null or both set". `claimed_by_user_id` is ON DELETE SET NULL, so deleting the claimer nulls the user and keeps `claimed_at`; a both or neither CHECK would then fail and abort the account deletion (AC-19). A row with `claimed_at` set and no user means "claimed by a deleted account": the claim query matches only `claimed_at IS NULL`, so those credits can never be claimed again. Updated 2026-11-23 to match migration `0003_money_ops`.

Relationships: user 1──1 `credit_account` · user 1──N `credit_ledger` · user 1──N `credit_hold` · user 1──N `payment` (nullable) · `tool_run` 1──N `credit_hold` (at most 1 active) · `credit_hold` 1──0..1 ledger charge entry · `payment` 1──0..1 `purchase` entry · `luna_credit_import` N──0..1 user.

Not in Postgres: the free chat counter and the guest grant IP counter (Upstash Redis, keys above).

Guest link (`users.linkGuest` gains these, in the same batch). The move or merge choice is made inside SQL, never by reading first in app code: lock the guest account row (`FOR UPDATE`) first, then upsert the target with `INSERT ... ON CONFLICT (user_id) DO UPDATE` so a target account created a moment earlier (`ensureAccount` uses `ON CONFLICT DO NOTHING`) is merged, not overwritten. Effect when the target had no account: the guest's balance, held amount, ledger, and holds all move. Effect when it had one: (1) write `guest_grant_forfeit` on the guest for `balance - held` when that is above 0, (2) add the guest's `held` to the target's `balance` and `held`, (3) move the guest's ledger and holds, (4) delete the guest account row. The sum of the target's ledger still equals its balance. Moved guest entries keep their original `balance_after`; the history page shows it as written. Add all three tables to the `link.int.test.ts` coverage.

**State transitions**:
- `credit_hold`: `active → charged` (report ready, or chat reply finished, or cut off by a disconnect with resumable streams off) · `active → released` (`report_failed` after 3 attempts, `abandoned`, `idle`, `chat_error`). Both are final. Every transition is a compare and set on `status = 'active'`.
- `payment`: `pending → succeeded` (webhook, callback, or sweep verify) · `pending → failed` (Paystack says failed) · `pending → abandoned` (sweep, no success after 24 hours). A verified success on an `abandoned` or `failed` payment still moves it to `succeeded` and grants (Paystack can settle late); nothing ever leaves `succeeded`.
- Idle sweep: a run hold is idle when `tool_run.updated_at` is older than `holdIdleDays`, and the sweep skips any run whose report is `generating`. Chat holds are swept separately once `created_at` is 15 minutes old.
- `luna_credit_import`: unclaimed → claimed (once).

**API surface** (Server Actions and route handlers; no public API, per spec 0001):

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Assistant tool `startRun` (approval required) | AI SDK tool | `toolId` (req), `shownPrice` (written by the server at approval request) | run id, hold id, available after | session user (guest or account) | `price_changed`, `insufficient_credits` (with `shortfall`, covering packs, guest flag) |
| Assistant tool `resumeRun` (approval only if no active hold) | AI SDK tool | `runId` (req), `shownPrice` when approval was needed | run id, hold id | owner | `price_changed`, `insufficient_credits`, `not_found` |
| `POST /api/chat` (existing route, billing step) | POST | conversation id, message | streamed reply; billing state in message metadata (`free` or `charged`, credits, free left) | session user | `insufficient_credits` card (no AI call), friendly error card |
| Server Action `startCheckout` | action | `packId` (req), `returnTo` (opt conversation id) | `authorizationUrl` | signed in, not anonymous | `not_signed_in`, `unknown_pack`, `rate_limited` (10 per hour per user), `paystack_unavailable` |
| `/credits/callback` route handler | GET | `reference` (req), `returnTo` (opt, must be a conversation UUID the user owns, else ignored) | verifies with Paystack server side, then redirects to the chat or `/credits` with a status toast | session user (owner of the payment); no session (expired mid checkout) redirects to sign in, the webhook still grants | `pending` / `ongoing` (no retry loop; toast "confirming, it will appear shortly", webhook or sweep finishes it), `failed`, `not_found` (also for another user's payment) |
| `/api/webhooks/paystack` | POST | raw body, `x-paystack-signature` | 200 | HMAC SHA512 of the raw body with `PAYSTACK_SECRET_KEY` | 401 bad signature; 200 for ignored events; 500 only on a DB outage (Paystack retries) |
| `/api/cron/billing` | GET | none | counts per job | `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron) | 401 |
| `/credits` page | GET | `cursor` (opt) | summary, packs, 20 ledger entries, next cursor | session user | none (empty history state) |
| Header balance chip | server component | none | available, warning flag | session user | hidden when no credit account yet |
| `pnpm credits:adjust <email> <amount> --reason <text> --actor <email>` | script | all required | new balance | staff with prod DB access | `user_not_found`, `would_go_below_held`, missing reason or actor |
| `pnpm credits:import-luna <csv>` | script | CSV `email,luna_credits` | imported, skipped counts | staff | invalid rows reported, nothing half imported |
| Better Auth database hook | server | user created with verified email, or email turned verified | calls `claimPendingGrants` | server only | logged `grant_claim_failed`, never blocks sign up |

Query layer (`src/db/queries/credits.ts`, `payments.ts`), all owner scoped and returning `Result` as spec 0002 does: `credits.getSummary`, `credits.ensureAccount` (with starter grant, key `starter:<userId>`), `credits.startRunWithHold` and `credits.resumeRunWithHold` (compose `runs.start` / `runs.resume` statements plus the hold plus `billing_assert`), `credits.holdForChat`, `credits.settleChat`, charge and release statement builders for `reports.markReady` / `markFailed` / `conversations.delete`, `credits.claimPendingGrants`, `credits.adjust`, `credits.listLedger` (keyset), the sweep functions (`releaseIdleHolds`, `expireInactive`, `findDrift`), `payments.create`, `payments.markSucceeded` (grants in the same batch, key `purchase:<paymentId>`), `payments.markFailed`, `payments.listStalePending`.

Money write shapes (the only allowed `credit_account` updates, each driven off the `RETURNING` of the step before it in one chained statement, so the `held <= balance` CHECK always holds):
- Hold: `held = held + $amount WHERE balance - held >= $amount`.
- Charge: `balance = balance - $charged, held = held - $holdAmount` in one UPDATE (a chat charge below the ceiling releases the rest this way too).
- Release: `held = held - $holdAmount`.
- Grant, purchase, adjustment, forfeit, expiry: `balance = balance + $amount` (negative for forfeit, expiry, and down adjustments), fed by `INSERT INTO credit_ledger ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING`, so a repeated key changes nothing.
- `payments.markSucceeded`: payment update (`WHERE id AND status IN ('pending', 'abandoned', 'failed')`) feeds the ledger insert, which feeds the account update. A crash can never leave a succeeded payment without its grant.

Idempotency keys: `starter:<userId>`, `signup:<userId>`, `luna:<importId>`, `purchase:<paymentId>`, `charge:<holdId>`, `forfeit:<guestUserId>`, `expiry:<userId>:<lastActivityAt>`, `adjust:<uuid>` (new per script run).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Confirm card | tool price | the tool module's `creditPrice` through `tools/registry.ts` (feature #5 contract; until then the Stellar module constant 30) |
| Confirm card | available balance | `credit_account.balance - held`; 0 shown when no account yet (the grant is created on approve) |
| `startRun` | price to hold | registry price at approval time, compared with the approved `shownPrice` (AC-2) |
| Short balance card | shortfall | `price - available` |
| Short balance card | covering packs | packs in `billing/config.ts` with `credits >= shortfall`, cheapest first; if none, the largest pack |
| Short balance card | buy vs sign up | `user.isAnonymous` |
| Chat route | free messages left | `config.chat.freePerDay[account or guest] -` Redis count for today |
| Chat route | today's date for the allowance | current time in `config.chat.dayTimeZone` (`Africa/Lagos`), formatted `YYYY-MM-DD` |
| Chat route | run in progress (free message) | `tool_run` with `status = 'in_progress'` in this conversation (one query, run in parallel with the message load) |
| Chat route | ceiling to hold | `config.chat.ceilingCredits` (3) |
| Chat `onFinish` | credits charged | `chatCharge(costUsd, config)` from `billing/pricing.ts`; `costUsd` from `ai-cost.ts` over `totalUsage` for the turn |
| Chat disconnect, resumable streams off | partial cost | 0 if no output chunk was received; otherwise the usage the AI SDK reports for the aborted stream through `chatCharge`, and 1 credit if none is reported |
| Chat route | notice already shown today | Redis key `billing:free-notice:<userId>:<lagosDate>` (48 hour expiry) |
| Header chip, `/credits` | expiry date | `last_activity_at + config.expiry.inactiveMonths` (12) |
| Header chip, `/credits` | warning | `now >= expiryDate - config.expiry.warnDays` (30) and `balance > 0` |
| `ensureAccount` | starter grant amount | `config.grants.starter` (30), or 0 when the guest IP counter is at `config.grants.guestPerIpPerDay` (3) |
| `ensureAccount` | client IP | the shared request IP helper from feature #21 (Vercel forwarded header) |
| `claimPendingGrants` | sign up grant | `config.grants.signup` (50) if the insert into `signup_grant_claim` succeeds |
| `claimPendingGrants` | email hash | HMAC SHA256(`lower(trim(user.email))`, `BILLING_HASH_SECRET`) |
| `claimPendingGrants` | Luna credits | `luna_credit_import.credits` matched on `lower(user.email)`, only when `user.emailVerified` |
| `startCheckout` | Paystack amount | `pack.priceNgn × 100` (kobo), stored as `payment.amount_kobo` |
| `startCheckout` | customer email | `user.email` (signed in accounts only) |
| `startCheckout` | callback URL | `NEXT_PUBLIC_APP_URL` + `/credits/callback?returnTo=<conversationId>` (conversation ownership checked on return) |
| Webhook, callback | credits to grant | `payment.credits` (copied at checkout, so a later pack edit does not change it) |
| Webhook, callback | amount check | Paystack `amount` and `currency` must equal `payment.amount_kobo` and `NGN` |
| Every ledger write | `balance_after` | computed in the same statement from the updated `credit_account.balance` |
| Adjust script | actor, reason | required `--actor` and `--reason` flags |
| Luna import | credits | `luna_credits × config.luna.rate` (10) |
| Luna export | luna_credits per email | Luna DB: sum of `creditsRemaining` on active, unexpired `CreditPurchase` rows per user email, taken at cutover |

Billing config (`src/billing/config.ts`, Zod checked at module load, defaults agreed in design):
`ngnPerCredit: 100` · `grants: { starter: 30, signup: 50, guestPerIpPerDay: 3 }` · `packs: [{ id: "p100", credits: 100, priceNgn: 10000 }, { id: "p300", credits: 300, priceNgn: 27000 }, { id: "p1000", credits: 1000, priceNgn: 85000 }]` (VAT inclusive) · `chat: { freePerDay: { account: 10, guest: 5 }, markup: 3, ceilingCredits: 3, usdToNgn: 1700, dayTimeZone: "Africa/Lagos" }` · `holdIdleDays: 30` · `expiry: { inactiveMonths: 12, warnDays: 30, enforce: false }` · `luna: { rate: 10 }`. Tool prices on the modules: Stellar 30, Beacon 150, Luna 500 (updated by [0011](../0011-beacon-advisory/index.md): Beacon is the Claude advisory, no separate Beacon Pro).

**Key invariants**:
- `balance >= 0` and `0 <= held <= balance` (DB CHECKs). Available = `balance - held`, never stored.
- For every user, the sum of `credit_ledger.amount` equals `credit_account.balance`, and `held` equals the sum of that user's `active` hold amounts (checked daily, AC-20).
- Every balance change writes exactly one ledger entry in the same batch; the ledger is never updated or deleted except by the user cascade.
- No money moves twice: every grant, charge, purchase, and expiry carries a unique `idempotency_key`.
- A hold amount is locked at hold time; config changes never alter it.
- At most one active hold per run; no report claim starts without one (`reports.claim` checks it in the same statement).
- A paid run and its hold commit together (`billing_assert`), and a report turning ready and its charge commit together.
- A guest can never start a checkout; prices are never read from the client.

**Security model**:
- Clients read only their own account, ledger, and holds; every query takes the session `userId` (spec 0002 convention). Another user's payment reference on the callback page returns `not_found`.
- Anonymous users can hold and spend starter credits, but cannot buy. `startCheckout` rejects them.
- The webhook trusts nothing until the HMAC SHA512 signature over the raw request body matches (constant time compare), then still checks amount and currency against our own `payment` row.
- Card details never touch the app: Paystack's hosted page handles them, so PCI DSS scope stays with Paystack.
- The cron route requires `CRON_SECRET`. Scripts need production DB credentials (staff only), require `--actor` and `--reason`, and ask for confirmation before writing.
- Compliance: payments and personal data fall under Nigeria's data protection law (NDPA) and GDPR for clients abroad. The ledger is the audit log for money (who, what, why, when). `payment` rows (no content, just amount, reference, date) are kept unlinked after deletion for tax records. `signup_grant_claim` keeps only a keyed hash for fraud prevention. Feature #18 must disclose both, and say unspent credits are forfeited on deletion and after 12 months of inactivity.
- `logEvent` lines carry ids, amounts, and kinds only; never emails, card data, or Paystack payloads.
- Rate limits: `startCheckout` 10 per hour per user; the guest grant IP cap; the existing chat and run limits from feature #21 still apply. The daily AI spend cap still pauses guest runs even when they hold starter credits.

**Configuration required**:
- `PAYSTACK_SECRET_KEY`: initialize and verify calls, and webhook signature checks. Optional at boot, required when billing is used (like `RESEND_API_KEY`). Test key on preview and local, live key only on production.
- `BILLING_HASH_SECRET`: at least 32 characters, keys the sign up grant email hash. Never rotate without a plan (rotation lets every old email claim again).
- `CRON_SECRET`: already planned for the guest purge job (spec 0001); add to `env.ts` if not there yet.
- Prerequisite: a live Paystack business account (the Luna account can be reused), with the webhook URL `https://<domain>/api/webhooks/paystack` set on both test and live modes.
- `vercel.json`: one daily cron entry for `/api/cron/billing`.
- List all new vars in `.env.example`.

**Critical test scenarios**:
- Happy path: guest approves Stellar, 30 held from the starter grant, report ready, 30 charged with one ledger entry, balance 0, verifies **AC-1**, **AC-4**, **AC-11**
- Concurrency: two parallel approvals for 30 each on a 40 balance, exactly one hold, the other `insufficient_credits`, no orphan run, verifies **AC-3**
- Price changed: approve with `shownPrice` 30 while config says 40, nothing held, `price_changed`, verifies **AC-2**
- Report failure: 3 failed attempts, hold released, balance unchanged; a retry after attempt 1 holds nothing new, verifies **AC-5**
- Stale attempt: a reclaimed older attempt calls `markReady`, gets `stale_attempt`, nothing charged, verifies **AC-4**
- Luna resume: phases fail at 3, resume, finish, one `run_charge`, verifies **AC-6**
- Idle: run idle 31 days, sweep releases, resume shows the confirm card, report claim without hold refused; a run whose report is `generating` is skipped; `markReady` with no active hold fails the attempt, verifies **AC-7**, **AC-4**
- Orphan chat hold: chat hold placed, function killed before settle, sweep releases it as `chat_error` after 15 minutes; a disconnect before first output with resumable streams off charges 0, verifies **AC-10**
- Chat: 11th message of the Lagos day holds 3, costs $0.004, charged 1; error charges 0; with resumable streams off, a disconnect before output charges 0 and after output charges usage; with resumable streams on, a disconnect mid reply still saves and charges the finished reply; balance 2 shows the short card with no AI call, verifies **AC-9**, **AC-10**
- Guest farming: 4th guest from one IP in a Lagos day gets 0; the same email signing up twice (with deletion between) gets one sign up grant, verifies **AC-11**
- Guest link: new account receives balance and holds; existing account receives held credits and history, unspent forfeited, ledger sum equals balance, verifies **AC-12**, **AC-20**
- Payment: webhook and callback arrive together, one `purchase` entry; tampered signature 401; amount mismatch no grant and an error log; pending over 1 hour resolved by the sweep, verifies **AC-13**
- Auth/permission: anonymous user calls `startCheckout` and gets `not_signed_in`; user B opens user A's payment reference and gets `not_found`; user B's `/credits` never shows A's ledger, verifies **AC-13**, **AC-14**
- Deletion: delete a user, account, ledger, and holds gone, `payment` rows kept with null user, `signup_grant_claim` kept, verifies **AC-19**
- Luna: import a CSV, sign up with that verified email, one `luna_import`; sign in again, nothing more, verifies **AC-16**
- Pure functions (Vitest): `chatCharge` rounding, minimum and ceiling; covering packs; expiry date and warning; Lagos day boundary at 23:59 and 00:00, verifies **AC-9**, **AC-10**, **AC-15**, **AC-18**

## Build plan

Ordered Tracer Bullet: milestone 1 is one thin, real thread (a guest pays for a Stellar run with starter credits) through config, DB, assistant, report, and UI. Each later milestone thickens it. Milestones 3 and 4 need signed in users with verified emails, so they start once feature #8 provides sign up.

**Milestone 1: thin thread, a Stellar run paid with starter credits**
1. [x] `src/billing/config.ts` (Zod checked, agreed defaults) and `src/billing/pricing.ts` pure functions (`available`, `shortfall`, `coveringPacks`, `chatCharge`, `expiryDate`, `lagosDate`) with Vitest tests, satisfies **AC-18**, **AC-10**, **AC-15**
2. [x] Migration 1: `credit_account`, `credit_ledger` (without the `payment_id` FK), `credit_hold`, their enums, indexes, CHECKs, and `billing_assert`, satisfies **AC-3**, **AC-20**
3. [x] `queries/credits.ts`: `ensureAccount` with starter grant, `startRunWithHold`, `getSummary`, and the charge and release statement builders; wire charge into `reports.markReady` and release into `reports.markFailed` (at 3 attempts) and `conversations.delete`; add the hold check to `reports.claim`. Integration tests on a Neon branch, including the concurrency race, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-11**
4. Add `creditPrice` to the tool module (Stellar 30) and make the assistant's `startRun` require approval via AI SDK 7 `toolApproval`; render the confirm card and the short balance card (guest variant: sign up prompt), satisfies **AC-1**, **AC-2**, **AC-8**, **AC-21**
5. Header balance chip (available balance), satisfies **AC-14**

**Milestone 2: hold lifecycle and paid chat**
6. [x] `resumeRun` with conditional approval and `resumeRunWithHold`; `price_changed` path, satisfies **AC-2**, **AC-7**
7. [x] `/api/cron/billing` with `CRON_SECRET` and the `vercel.json` entry; `releaseIdleHolds` job (run holds idle 30 days, skipping `generating` reports; chat holds older than 15 minutes), satisfies **AC-7**, **AC-10**
8. [x] Chat billing in the chat route: Redis free counter, run in progress exemption, ceiling hold, `onFinish` settle with `chatCharge`, error release, stop partial charge, the once a day notice, satisfies **AC-9**, **AC-10**, **AC-21**
9. [x] Guest grant IP cap in `ensureAccount`, satisfies **AC-11**
10. [x] Multi phase charge once test (a fake phased tool until Luna lands in #12), satisfies **AC-6**

**Update 2026-11-22: no chat Stop under resumable streams**
20. [x] In `src/lib/resumable.ts`, `start`'s catch (the Redis buffer failed to start) reads the copy to its end and discards it instead of calling `sse.cancel()`, so the reply still finishes and settles `completed` after a disconnect. If the stream is already locked (the library took its reader before failing), log `resumable_start_failed` as today and leave it. `disabledResumableStreams.start` keeps cancelling (the dev and CI disconnect rule). Unit test in `resumable.test.ts`: a failing `createNewResumableStream` on an unlocked stream drains it to the end, satisfies **AC-10**
21. [x] Reword every comment and test name that calls a cancelled chat stream a "Stop" to say it is a disconnect with resumable streams off: the `chat-api.ts` header comment, `onAbort`, the `billing` and `settleOnce` comment, `stopped` and `onEnd`; `chat-billing.ts` `ChatEnd` and `chatSettleAmount`; `pricing.ts` `chatChargeOnStop`. No renames. Done when `grep -rn "Stop" src/assistant src/billing` shows only the run Stop (the stop card and `stopRun`). The existing cancel test in `chat-api.test.ts` stays as the resumable off case. Add a `chat-api.test.ts` case that emulates the route's tee (cancel one branch, drain the other) and checks the turn settles `completed` with one charge and a saved reply; it checks billing, not the route wiring, which the manual verify step covers, satisfies **AC-10**

**Milestone 3: buying credits (needs #8 sign up)**
11. [x] Migration 2: `payment` table and enum, plus the `credit_ledger.payment_id` FK, satisfies **AC-13**
12. [x] `src/billing/paystack.ts`: typed `fetch` wrapper (initialize, verify) with Zod parsed responses returning `Result`, and the HMAC check; unit tests with recorded fixtures, satisfies **AC-13**
13. [x] `startCheckout` Server Action (rate limited), `/credits/callback` page, `/api/webhooks/paystack` route, `payments.markSucceeded` with the grant in one batch; the stale pending sweep job, satisfies **AC-13**, **AC-21**
14. [x] "Buy" on the short balance card, returning to the chat; `/credits` page with summary, packs, and keyset paginated history, satisfies **AC-8**, **AC-14**

**Milestone 4: accounts, grants, and money operations**
15. [x] Migration 3: `signup_grant_claim` and `luna_credit_import`, satisfies **AC-11**, **AC-16**
16. [x] `claimPendingGrants` (sign up grant plus Luna claim) wired to the Better Auth database hook, the `/credits` load, and the first billable action, satisfies **AC-11**, **AC-16**
17. [x] Extend `users.linkGuest` with the move and merge rules; extend `link.int.test.ts` and the deletion cascade test, satisfies **AC-12**, **AC-19**
18. [x] `pnpm credits:adjust` and `pnpm credits:import-luna` scripts with confirmation and validation, satisfies **AC-16**, **AC-17**
19. [x] Cron jobs `expireInactive` (behind `expiry.enforce`) and `findDrift`; expiry warning dot and banner, satisfies **AC-15**, **AC-20**

## Consequences

**Positive**:
- Every credit can be explained: the ledger is a full history for the client, for disputes, and for the daily drift check.
- A failed AI report never costs the client anything, and no money operation can happen twice, even under retries and replays.
- Prices, packs, and grants change in one reviewed file, and new tools bring their own price.
- No new paid service: Paystack is already BeamX's processor, and Vercel Cron and Upstash are already in the stack.

**Negative / tradeoffs**:
- Holds add a second number to keep in step (`held`), and every money path must use the provided statement builders; a hand written `UPDATE credit_account` breaks the invariants.
- `billing_assert` is a raised error used for control flow, a small, deliberate oddity that the query layer must map carefully.
- Holds are deleted with their run (CASCADE), so a settled hold leaves no row once its run is gone; the ledger entry (with `hold_id` and `run_id` set to null) is the lasting record. Deleting a run on its own, which nothing does today, must release its hold first.
- Metered chat means the exact chat price isn't known before sending (only the ceiling).
- Price changes need a deploy (about 2 minutes); there is no admin UI until the staff console.
- Expiry is not enforced until the email reminder ships, so inactive balances linger until slice 5.
- Two small leaks are accepted: parallel messages at the allowance edge, and partial disconnect charges when the SDK reports no usage (charged 1, only where resumable streams are off).
- If the platform kills a reply at the 90 second function limit, nothing settles, and the 15 minute sweep releases the hold as `chat_error`, so that reply is free even if output arrived. Rare and at most 3 credits; accepted.
- A client cannot stop a paid reply once it starts: it always runs to the end and is charged, at most the 3 credit ceiling. A real Stop (a stop endpoint that aborts the AI call across function instances) is deferred.
- Audit logs for money are not optional here: the ledger is that log and must never be bypassed.

**Neutral**:
- Spec 0002 grows by six tables and one SQL function, all additive. `users.linkGuest` and the deletion tests must cover the new user owned tables.
- A new `src/billing/` module joins the spec 0001 layout (routes and the assistant may call it); `/sync` should record it and add `src/billing/AGENTS.md`.
- Feature #5's tool contract gains `creditPrice`; feature #6's assistant gains approval gated `startRun` and `resumeRun`.
- The Luna cutover needs a change in the Luna repo (`paid-marketing-plan`), outside this codebase.

## Follow-up

- [ ] Scope order: milestones 3 and 4 depend on feature #8 (sign up with verified email). Consider splitting #22 so milestones 1 and 2 stay in Slice 1 and 3 and 4 land right after #8 (a `/scope` change).
- [ ] Feature #5 (tool contract) must include `creditPrice: number`; feature #6 (assistant brain) must use approval gated `startRun` / `resumeRun` as specified here.
- [ ] Luna cutover runbook: freeze Luna credit sales and spending, export balances with the query in Value sourcing, run `credits:import-luna`, then ship a Luna banner pointing clients to the workspace. Needs a small change in the Luna repo.
- [ ] Slice 5: email reminder 30 days before expiry (sets `expiry_warned_at`), then turn on `expiry.enforce`.
- [ ] Confirm with BeamX's accountant that pack prices are VAT inclusive and that the receipt Paystack emails is enough, or whether the app must issue invoices.
- [ ] Feature #18 (privacy and terms): disclose kept payment records, the email hash, forfeiture on deletion, and the 12 month expiry.
- [ ] Alerting on `credit_drift` and `payment_amount_mismatch` logs once analytics and error monitoring (deferred) exist; until then, check the cron logs weekly.
- [ ] `src/billing/AGENTS.md` should hold the billing conventions (statement builders only, idempotency keys, Paystack test vs live) before milestone 1 starts; root `AGENTS.md` gets a one line pointer. `/sync` owns writing it.
- [ ] `vercel-schedules` skill was installed during design; record it in `src/billing/AGENTS.md` (`## Agent skills`). Record as declined there: `rexedge/paystack`, `alexasomba/paystack-node` skills.
- [ ] Optional for milestone 3: connect Paystack's official MCP server (`@paystack/mcp-server`, beta) with a TEST secret key only, to inspect test transactions. Avoid `@tracent/paystack-mcp` (third party despite its wording).
- [ ] Re-check `config.chat.usdToNgn` monthly while the naira moves; the markup absorbs small drift.
