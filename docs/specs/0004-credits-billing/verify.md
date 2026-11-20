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
