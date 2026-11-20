# Review, feat/credits-billing, 2026-11-20

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 33 files (money code focus), branch vs main
**Verdict**: Changes requested

## Summary
Adds the credit ledger, account and hold tables, the single-statement hold/charge/release shapes, charge-on-ready wired into `reports.markReady`, release on failure/abandon/conversation delete, and guest link merge. The design is sound: CHECK constraints enforce `0 <= held <= balance`, holds are conditional UPDATEs, charge is keyed by a unique ledger key, and stale attempts match no row. The headline issue is a narrow race where a report can turn ready without a charge; a few hold-guard gaps are minor.

## Major
### 🟠 Report can turn ready with no charge when the hold is released concurrently, `src/db/queries/reports.ts:127-136`
**Problem**: In `markReady`, the `r` CTE decides "hold is active" from the statement snapshot, but the `ch` CTE re-checks `status = 'active'` on the live row. If the idle sweep, abandon or `markFailed` release commits between snapshot and the row lock, `r` marks the report `ready` while `ch` matches zero rows. Nothing asserts that a charge happened.
**Why it matters**: A free report, and no `run_charge` ledger entry. It breaks AC-4 ("never ready for free"). The window is narrow but the idle sweep (task 7) will make it real.
**Suggested fix**: Make the report update depend on the charge, not on a snapshot read. For example, lock the hold row first (`SELECT ... FOR UPDATE` in a leading CTE and drive `r` from it), or add a `billing_assert` after the statement that a `run_charge` exists for the run and let the batch roll back. Add a concurrency test.

## Minor
### 🟡 `holdExistingRun` can hold a run whose report is already ready, `src/db/queries/credits.ts:107-126`
**Problem**: `holdForRunStatement` only excludes `abandoned` runs. Holding a run whose report is `ready` (already charged) creates an active hold nothing will ever charge.
**Why it matters**: Credits stay held until the idle sweep (30 days) and `claim` returns `already_ready`.
**Suggested fix**: Require the run to be one that can still produce a report (no `ready` report) in the hold statement.

### 🟡 `resumeRunWithHold` accepts a run that was already `in_progress`, `src/db/queries/credits.ts:232-235`
**Problem**: The `not_paused` assert only checks the final status is `in_progress`, so a run already `in_progress` passes and gets a hold.
**Why it matters**: Mislabeled error semantics; harmless today only because an active run normally has a hold (then `already_held` fires).
**Suggested fix**: Assert the run was `paused` before the batch, e.g. fold the `paused` condition into the hold statement.

### 🟡 Possible deadlock between guest link and a concurrent charge, `src/db/queries/credits.ts:295-330`
**Problem**: Link locks the guest account first, then updates holds; a concurrent charge locks the hold row first, then the account. Opposite lock order.
**Why it matters**: Postgres aborts one side; a rare failed link or a failed `markReady` (retryable). Not a money error.
**Suggested fix**: Document it, or have the link lock holds before the account. No test covers link racing a charge.

### 🟡 Charge CTE silently skips the ledger row if the account update matches nothing, `src/db/queries/credit-holds.ts:347-367`
**Problem**: `cl` joins `ca`; if no account row matched, the hold is marked `charged` with no balance change and no ledger entry.
**Why it matters**: Unreachable today (FK cascade), but a silent money inconsistency if it ever happens; the daily drift check would be the only catch.
**Suggested fix**: Assert (`billing_assert`) that `ca` updated one row per charged hold.

### 🟡 `ensureAccount` returns `created: false` for a missing user without signaling it, `src/db/queries/credits.ts:62-85`
**Problem**: The insert selects from `"user"`, so an unknown user id yields no account and the same result as "already exists".
**Why it matters**: Callers cannot tell; the later hold fails as `insufficient_credits`, which is misleading.
**Suggested fix**: Return a distinct result or let the caller verify the user.

## Nits
- ⚪ `src/db/queries/credits.ts:168-170`, `case null:` plus `default:` both throw; the explicit `case null` adds nothing.
- ⚪ `src/db/queries/reports.ts:127`, `JSON.stringify(content)` of `undefined` becomes SQL NULL; content is typed `unknown`, so consider a Zod check at the boundary.

## Strengths
- Every balance change is one statement with the check in the WHERE clause, backed by DB CHECK constraints (`balance >= 0`, `held <= balance`), so races cannot produce a negative balance. The racing-approval test proves exactly one hold wins.
- Charge idempotency is layered: stale attempts match no report row, the hold turns `charged` once, and the ledger key is `charge:<hold id>`.
- `markReady` with a vanished hold fails the attempt instead of delivering a free report, and the spec's cascade reasoning for `credit_hold.run_id` is documented in the schema.
- Guest link decides move vs merge in SQL, with a forfeit entry that keeps the target's ledger sum equal to its balance; destructured batch indexes check out.

## Test coverage
Good integration coverage: account creation and idempotency, capped guest, start with hold, short balance, racing approvals, cross-user, charge once, stale attempt, no-hold failure, retries and the third-failure release, abandon, conversation delete, resume, double hold, and both link cases. Pure pricing has Vitest tests. Missing: the concurrent release vs `markReady` race (finding above), `holdExistingRun` on a ready run, link racing a charge, and user delete with an active hold (AC-19 is listed in the spec but I found no test).

## Follow up (2026-11-20)
- Major fixed: `markReady` now locks the hold row first (`SELECT ... FOR UPDATE` in a leading CTE) and drives the report update from that lock, so a release that commits first leaves the report `generating` and the second statement fails the attempt as `no_credit_hold`. A `billing_assert(..., 'charge_missing')` backstop rolls the batch back if a ready report ever lands without exactly one charge and one ledger entry (this also covers the minor about the charge CTE skipping its ledger row).
- Still open, left for later milestones: `holdExistingRun` on a ready run, `resumeRunWithHold` on an already in progress run, link versus charge lock order, `ensureAccount` for a missing user, the two nits. AC-19 deletion test belongs to task 17 (not built yet). The release versus `markReady` race has no deterministic test over `neon-http`; the lock plus assert is the guard.
