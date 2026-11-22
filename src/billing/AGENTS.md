# Billing

## Overview

Credits and billing (spec 0004): the typed billing config and the pure billing math. One credit is worth ₦100. The money writes themselves (holds, charges, releases, grants, the ledger) live in the query layer, `src/db/queries/credits.ts` and `src/db/queries/credit-holds.ts`, not here. Routes and the assistant may call this module.

## Key files

| Path              | Owns                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`       | `billingConfig`, Zod checked: credit value, grants, packs, chat allowance and metering, hold timeouts, expiry, the Luna rate                                                     |
| `pricing.ts`      | Pure functions: `available`, `shortfall`, `coveringPacks`, `priceStillValid`, `chatCharge`, `chatChargeOnStop`, `localDate`, expiry helpers                                      |
| `chat-billing.ts` | Paid chat and the guest starter grant cap: `planChat`, `chatSettleAmount`, the `freeChat` allowance counter, `accountOpener`; shared by the chat route and the assistant's tools |
| `cron.ts`         | The daily billing job behind `GET /api/cron/billing`: `cronAuthorized` (bearer check in constant time) and `runBillingCron` (the hold sweeps)                                    |

## Commands

```bash
pnpm test               # includes pricing.test.ts
pnpm test:integration   # credits.int.test.ts covers the money writes (needs a Neon branch)
```

## Conventions

- Prices, packs, grants, and allowances come only from `billingConfig`; changing one is a reviewed code change. Never hardcode a credit amount elsewhere.
- `pricing.ts` stays pure: config is passed in, no I/O, no clock reads (pass `now`).
- The price to hold is the server's current price, passed into the credit queries; never trust a price sent by the client.
- Every balance change goes through `db/queries/credits.ts` or the statement builders in `db/queries/credit-holds.ts`, which write the ledger entry in the same batch. A hand written `UPDATE credit_account` breaks the invariants (ledger sum equals balance, `held` equals the sum of active holds).
- Money writes use idempotency keys (`starter:<userId>`, `charge:<holdId>`, `forfeit:<guestUserId>`), so a retry or replay never moves credits twice.
- The allowance day and expiry dates use the Lagos day (`chat.dayTimeZone`), not UTC.
- Billing Redis keys (`billing:free-chat:*`, `billing:free-notice:*`, `billing:guest-grant:*`) come only from `billingKeys` and go through the shared `LimitStore` from `src/lib/limits.ts`, which never throws.
- The daily job runs from Vercel Cron (`crons` in `vercel.json`, 02:00 UTC). The route only passes the `Authorization` header to `runBillingCron`; it needs `CRON_SECRET` (at least 16 characters, required in production), and without it every call gets `401`. New sweeps (payments, expiry, drift) join `runBillingCron`, not new routes.

## Agent skills

- [vercel-schedules](../../.claude/skills/vercel-schedules/): `vercel/vercel-plugin`, Vercel Schedules and cron jobs (the daily billing job)
- Declined: `rexedge/paystack`, `alexasomba/paystack-node` skills

## Related specs

- [0004 Credits and billing](../../docs/specs/0004-credits-billing/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
