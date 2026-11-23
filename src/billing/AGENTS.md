# Billing

## Overview

Credits and billing (spec 0004): the typed billing config and the pure billing math. One credit is worth ₦100. The money writes themselves (holds, charges, releases, grants, the ledger) live in the query layer, `src/db/queries/credits.ts` and `src/db/queries/credit-holds.ts`, not here. Routes and the assistant may call this module.

## Key files

| Path              | Owns                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`       | `billingConfig`, Zod checked: credit value, grants, packs, chat allowance and metering, hold timeouts, expiry, the Luna rate                                                                                                                                                                           |
| `pricing.ts`      | Pure functions: `available`, `shortfall`, `coveringPacks`, `priceStillValid`, `chatCharge`, `chatChargeOnStop`, `localDate`, expiry helpers                                                                                                                                                            |
| `chat-billing.ts` | Paid chat and the guest starter grant cap: `planChat`, `chatSettleAmount`, the `freeChat` allowance counter, `accountOpener`; shared by the chat route and the assistant's tools                                                                                                                       |
| `cron.ts`         | The daily billing job behind `GET /api/cron/billing`: `cronAuthorized` (bearer check in constant time), `runBillingSweeps` (the hold sweeps), `runExpiry` (AC-15), `runDriftCheck` (AC-20), and `runDailyJobs` (runs each daily job on its own: the sweeps, expiry, drift and spec 0009's guest purge) |
| `money-ops.ts`    | Pure helpers for the grants and staff scripts: `normalizeEmail`, `signupEmailHash` (HMAC SHA256 with `BILLING_HASH_SECRET`), `parseLunaCsv` (all or nothing), `parseAdjustArgs`                                                                                                                        |
| `summary.ts`      | The chip's numbers (`toCreditSummary`, `creditSummarySchema`) and its expiry warning dot (`expiryWarning`)                                                                                                                                                                                             |

## Commands

```bash
pnpm test               # includes pricing.test.ts
pnpm test:integration   # credits.int.test.ts and money-ops.int.test.ts cover the money writes (needs a Neon branch)
pnpm credits:adjust <email> <amount> --reason <text> --actor <email>   # staff grant or correction, asks first
pnpm credits:import-luna <csv>   # load the Luna export (email,luna_credits), all or nothing
```

## Conventions

- Prices, packs, grants, and allowances come only from `billingConfig`; changing one is a reviewed code change. Never hardcode a credit amount elsewhere.
- `pricing.ts` stays pure: config is passed in, no I/O, no clock reads (pass `now`).
- The price to hold is the server's current price, passed into the credit queries; never trust a price sent by the client.
- Every balance change goes through `db/queries/credits.ts` or the statement builders in `db/queries/credit-holds.ts`, which write the ledger entry in the same batch. A hand written `UPDATE credit_account` breaks the invariants (ledger sum equals balance, `held` equals the sum of active holds).
- Money writes use idempotency keys (`starter:<userId>`, `signup:<userId>`, `luna:<importId>`, `charge:<holdId>`, `forfeit:<guestUserId>`, `expiry:<userId>:<lastActivityAt>`, `adjust:<uuid>`), so a retry or replay never moves credits twice.
- Account grants go through `claimGrants` (`src/auth/grants.ts`): the starter grant, the sign up grant once per email ever (only a keyed hash kept in `signup_grant_claim`, which outlives the account), and any Luna import. It runs from the verified account hook and at a signed in user's paid actions (`accountOpener`), so a missed hook heals itself. Never rotate `BILLING_HASH_SECRET` (required in production) without a plan: a new key lets every old email claim the sign up grant again.
- The staff scripts (`scripts/credits/`) write to whatever `DATABASE_URL` is set (`.env` by default, the dev branch); export the production URL only on purpose. They validate first, show the change and ask (`--yes` skips the prompt).
- The allowance day and expiry dates use the Lagos day (`chat.dayTimeZone`), not UTC.
- Billing Redis keys (`billing:free-chat:*`, `billing:free-notice:*`, `billing:guest-grant:*`) come only from `billingKeys` and go through the shared `LimitStore` from `src/lib/limits.ts`, which never throws.
- The daily job runs from Vercel Cron (`crons` in `vercel.json`, 02:00 UTC). The route only wires the jobs and passes the `Authorization` header to `runDailyJobs`; it needs `CRON_SECRET` (at least 16 characters, required in production), and without it every call gets `401`. Hold sweeps (and the payment sweep) join `runBillingSweeps`; other daily jobs (expiry, drift, the purge) join `runDailyJobs` as their own jobs, not new routes. Expiry only counts while `expiry.enforce` is false, and the drift check logs `credit_drift`, never repairs. One job throwing is logged and never stops the others.

## Agent skills

- [vercel-schedules](../../.claude/skills/vercel-schedules/): `vercel/vercel-plugin`, Vercel Schedules and cron jobs (the daily billing job)
- Declined: `rexedge/paystack`, `alexasomba/paystack-node` skills

## Related specs

- [0004 Credits and billing](../../docs/specs/0004-credits-billing/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
