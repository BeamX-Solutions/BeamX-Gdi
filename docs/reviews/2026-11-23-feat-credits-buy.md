# Review, feat/credits-buy, 2026-11-23

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 43 files, branch vs main
**Verdict**: Approve with nits

## Summary
Adds buying credits with Paystack: a checkout Server Action, a callback route, a signed webhook, a daily sweep of stale pending payments, a payment table, and the /credits page with history. The money path is well built. The grant is one SQL statement (payment update, balance upsert and ledger entry together), guarded by the payment status, our own amount and currency, and the ledger key `purchase:<paymentId>`, so the webhook, the callback and the sweep can race safely. No blockers or majors were found. The issues are small: a few unhelpful messages and one older bug found by verify that this branch did not touch.

## Minor
### 🟡 Sign up grant can change the balance without a ledger entry (older code, not changed here), `src/db/queries/credits.ts:690`
**Problem**: Confirmed by reading the code. In `claimPendingGrants` the signup statement inserts the claim row, then the `a` step raises the balance whenever that claim row was new. The ledger step uses `ON CONFLICT (idempotency_key) DO NOTHING`. If the email hash is new but `signup:<userId>` already exists (email change, rotated `BILLING_HASH_SECRET`), the balance goes up and no ledger line is written.
**Why it matters**: Ledger sum no longer equals balance. The daily drift check would report it, but the user keeps free credits. This branch did not touch the function (last changed in 270713c), and it is not reachable from the UI today, so it does not block this merge.
**Suggested fix**: Make the balance update depend on the ledger insert succeeding (insert the ledger row first, update the balance only from rows that were really inserted), or skip the grant when a `signup:<userId>` entry exists. Add an integration test for the rotated hash case.

### 🟡 Paystack refusal because of the input shows "unavailable", `src/billing/paystack.ts:141`
**Problem**: Confirmed. Any non 2xx from initialize (a 400 for a rejected email, a 401 for a wrong key) becomes `paystack_unavailable`, and the user sees the generic "Payments are unavailable right now" text. The log line also leaves out the HTTP status.
**Why it matters**: A user whose email Paystack rejects retries forever, and a wrong live key looks like an outage in the logs.
**Suggested fix**: Log the status code (and Paystack's `code` field) with `paystack_unavailable`. Optionally add a separate "check your account email" result for a 400.

### 🟡 Pending row left behind when initialize fails, `src/billing/checkout.ts:114`
**Problem**: The row is created before initialize, and the rate limit slot is spent before that. If Paystack is down, the row stays pending until the sweep abandons it a day later.
**Why it matters**: Mostly fine. History reads the ledger, not payments, so the user never sees these rows. The sweep verifies them (a harmless not_found) and abandons them after 24 hours. The costs are inflated abandoned counts for metrics, extra sweep calls, and an outage burning a user's 10 checkouts an hour.
**Suggested fix**: Acceptable as is. Cheap improvement: mark the row `abandoned` right away when initialize fails, which also keeps the sweep short.

### 🟡 A paid but mismatched payment tells the user it failed, `src/billing/checkout.ts:264`
**Problem**: `mismatch` maps to the `failed` notice, so the user is shown "payment failed" although Paystack took money. The row stays pending and the only trace is a log line `payment_amount_mismatch`.
**Why it matters**: Rare (needs a changed price or tampering), but the person is charged with no credits and no clue. Staff only learn of it from logs.
**Suggested fix**: Show wording that says "we are checking this payment", keep the log event as an alert source, and document the manual path (staff adjustment) in the spec.

### 🟡 Payment toast is easy to miss, `src/components/workspace/toast.tsx:11`
**Problem**: The toast is `aria-hidden` and shows for 4 seconds. Screen readers hear it through the Thread's polite region, but `spoken = status ?? notice` in `thread.tsx:45` drops it whenever a status line is showing. The pending message is a long three sentence text for a 4 second toast.
**Why it matters**: A user returning from Paystack can miss "Payment received" or the pending explanation. The credit chip refreshing is the only other signal.
**Suggested fix**: Give payment notices a longer time (or keep until dismissed), and speak the notice even when a status is showing. Failures land on /credits, where the banner is persistent, which is good.

## Nits
- ⚪ `src/billing/checkout.ts:264`, the nested ternary in `callbackDestination` would read better as a small `switch` with the never check, like the rest of the file.
- ⚪ `src/app/api/cron/billing/route.ts:2`, the header comment line is now very long; wrap it.
- ⚪ `src/db/queries/payments.ts:125`, the `markFailed` comment could say that a failed payment can still succeed later (markSucceeded allows it, which is the correct design).

## Checks of the items you listed
- (a) Real, but older code and not touched by this branch. See the first minor.
- (b) Confirmed, minor.
- (c) Fine, with the small costs above.
- (d) Not found. The /credits page is a non async component; `searchParams` is only passed into a Suspense child, `connection()` and the session read sit inside that child, and the Header is a client component that tolerates a missing workspace context. "Back to chat" is a plain Link to `/`. The verify run used a production build and records no prerender error.
- (e) Partly true, see the last minor.

## Strengths
- The grant is one atomic statement with a compare and set on status. Webhook, callback and sweep can all run at once and only the first grants. A failed or abandoned payment can still succeed later.
- Webhook: raw body read with `request.text()`, HMAC SHA512 compared in constant time on the raw bytes, 401 before any parse or DB work, unknown references and other events answered 200, DB outage answers 500 so Paystack retries.
- Amount and currency are compared to our own stored row both in code and inside the SQL, and the price never comes from the client (pack id only, kobo computed from config).
- Owner scoping is right: the callback uses `forUser`, a foreign reference is `not_found`; `returnTo` is accepted only as a UUID the user owns, and the redirect is built from a fixed path on our own origin, so there is no open redirect. History is filtered by user id, and the keyset cursor is Zod validated, uses raw timestamp strings (no lost microseconds) and breaks ties by id.
- The sweep is oldest first, limited to 100, stops after 60 seconds (plus at most one 10 second Paystack call), which fits within 300 seconds beside the 120 second purge. Logs carry ids only, no email or card data.
- The Paystack wrapper never throws, has a 10 second timeout and Zod parses every response; the payment table is excluded in `LINK_EXCLUDED_TABLES` with set null deletes; the migration is additive.

## Test coverage
Good. Unit tests cover checkout, settle, callback, webhook, sweep, signature, the Paystack wrapper with recorded fixtures, the route handlers, the action, the history cursor and copy. `payments.int.test.ts` covers the race and grant statement against a real database (not run in the verify session, so run it on a throwaway branch before merge). Not covered: the toast timing and live region behaviour, and the rotated hash case for `claimPendingGrants`.
