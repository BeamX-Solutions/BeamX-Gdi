# Lib

## Overview

Shared server helpers every feature leans on: the Zod checked env module, rate limits, the daily AI spend cap, and small shared utilities. All of them are built: the abuse limits and the spend cap follow spec 0008.

## Key files

| File            | Owns                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env.ts`        | The only place env vars are read; Zod schema for every var                                                                                             |
| `ai-cost.ts`    | Price table used to turn AI `usage` tokens into dollars                                                                                                |
| `result.ts`     | `Result<T, E>` with `ok()` / `err()` for expected failures                                                                                             |
| `log.ts`        | `logEvent(event, fields)`: one structured JSON log line                                                                                                |
| `turn-lock.ts`  | The per chat turn lock on Upstash (`turn:<conversationId>`, 60 second expiry); `acquire` and `release` never throw                                     |
| `resumable.ts`  | Resumable chat streams (spec 0007): `resumable-stream` over Upstash, with the `chat:active:<conversationId>` pointer (5 minute expiry)                 |
| `bot-check.ts`  | `isBot()`: Vercel BotID for `POST /api/chat`, the anonymous sign in and the auth POSTs (`src/auth/paths.ts`); off Vercel every request counts as human |
| `fake-model.ts` | Scripted AI SDK mock models used when `E2E_FAKE_AI=true` (`pnpm e2e`); a production deploy refuses to boot with it on                                  |
| `limits.ts`     | The abuse limits (spec 0008): limit config from env, the Lagos day, Redis key names, the `LimitStore`, and the run, chat and guest guards              |
| `spend-cap.ts`  | The daily AI spend cap: `withSpend` wraps `usage.record`, `guestSpendCap` checks guests at chat and at Approve                                         |
| `client-ip.ts`  | `clientIp` / `requestIp`: the client IP from `x-forwarded-for` (then `x-real-ip`), or null                                                             |
| `batches.ts`    | `runInBatches`: repeats a batch job until a short batch or a spent time budget (the daily guest purge)                                                 |

## Conventions

- `env.ts`: required vars fail the app at boot; optional ones (`RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `INNGEST_*`) fail only when their feature is used. `SKIP_ENV_VALIDATION=1` lets `next build` run in CI without secrets. Every var is listed in `.env.example`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are optional in dev, CI and Preview (the turn lock is then off and logs `turn_lock_disabled`), but required when `VERCEL_ENV=production` (`envSchema`). A Redis error in `acquire` fails closed: the turn gets the `busy` notice, never a 500.
- `ENABLE_DESIGN_PAGE=true` turns on `/design`. It is read at build time (Cache Components prerenders the page), so changing it needs a new build; set it explicitly to `false` to test the 404, since the local `.env` sets it on.
- `utils.ts` holds `cn()` (clsx plus tailwind-merge) for class names; shadcn components import it.
- Abuse limits come from env (`LIMIT_*`, `MAX_MESSAGE_CHARS`, `RATE_LIMIT_MESSAGES_PER_RUN`, all listed in `.env.example`) with these defaults: 3 tool runs a day per guest, 20 per IP (loose, Nigerian carriers share IPs), 30 typed guest messages and 20 new chats a day, 30 new guests a day per IP, a burst of 10 chat requests a minute per user and 60 per IP, 40 messages per run, 4,000 characters per message, and a `maxOutputTokens` ceiling on every AI call. Hitting a limit shows a friendly message, never an error.
- Daily limit counters and the spend total reset at midnight Lagos time (`lagosDate`), not UTC. Build key names only through `limitKeys`.
- The hourly counters (`reportEmail`, `dataExport`) bucket by UTC clock hour (`YYYY-MM-DDTHH`), so a burst can straddle an hour boundary.
- Every limit goes through `LimitStore`, which fails open: a Redis error (or no Upstash vars) allows the request and logs `limit_check_failed`. This is the opposite of the turn lock, which fails closed.
- With no client IP, the IP limits are skipped, never pooled into one shared bucket.
- Spend cap: `withSpend` adds each call's `ai_usage` cost into `spend:<lagosDate>` only once the row is saved (a duplicate `callKey` adds nothing). Over `AI_DAILY_SPEND_CAP_USD`, guests get a come back tomorrow notice at chat and at Approve; signed in users continue, and a report already claimed always finishes.
- `logEvent` takes an event name plus ids, counts, and flags only; never message content, answers, or secrets.
- Upstash Redis lives in `eu-central-1` and is shared with `resumable-stream`; namespace keys with a clear prefix per use.

## Gotchas

- Upstash pub/sub messages must not carry raw newlines. The REST subscription is itself SSE and `@upstash/redis` splits it on newlines, so a multi line message (like an SSE chunk) arrives cut at its first newline. `resumable.ts` JSON encodes every message for this reason; keep that for any new pub/sub use.
- BotID can't be tested through the Deployment Protection bypass token: Vercel trusts bypassed requests and `checkBotId` says human. To check it on a preview, turn off Require Log In briefly, send a plain request with no bypass (expect `403 {"code":"bot"}`), then turn it back on. BotID Basic needs no dashboard switch; only Deep Analysis (paid) does.
- The Vercel team is on the Hobby plan for now: function `maxDuration` tops out at 300 seconds, and runtime logs last about an hour, so read them right after a test.

## Agent skills

- [upstash-ratelimit-js](../../.claude/skills/upstash-ratelimit-js/): `upstash/skills`, rate limiting with `@upstash/ratelimit`
- [upstash-redis-js](../../.claude/skills/upstash-redis-js/): `upstash/skills`, Redis client, counters, keys

Declined: Upstash MCP

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md)
- [0008 Abuse and AI cost guards](../../docs/specs/0008-abuse-cost-guards/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
