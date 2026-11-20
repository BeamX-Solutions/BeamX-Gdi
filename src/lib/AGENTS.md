# Lib

## Overview

Shared server helpers every feature leans on: the Zod checked env module, rate limits, the daily AI spend cap, and small shared utilities. `env.ts`, `result.ts`, `log.ts`, and `turn-lock.ts` exist; rate limits, the spend cap, and `ai-cost.ts` are not built yet, so those lines record the rules from spec 0001.

## Key files

| File           | Owns                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `env.ts`       | The only place env vars are read; Zod schema for every var                                                         |
| `ai-cost.ts`   | Price table used to turn AI `usage` tokens into dollars                                                            |
| `result.ts`    | `Result<T, E>` with `ok()` / `err()` for expected failures                                                         |
| `log.ts`       | `logEvent(event, fields)`: one structured JSON log line                                                            |
| `turn-lock.ts` | The per chat turn lock on Upstash (`turn:<conversationId>`, 60 second expiry); `acquire` and `release` never throw |

## Conventions

- `env.ts`: required vars fail the app at boot; optional ones (`RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `INNGEST_*`) fail only when their feature is used. `SKIP_ENV_VALIDATION=1` lets `next build` run in CI without secrets. Every var is listed in `.env.example`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are optional in dev, CI and Preview (the turn lock is then off and logs `turn_lock_disabled`), but required when `VERCEL_ENV=production` (`envSchema`). A Redis error in `acquire` fails closed: the turn gets the `busy` notice, never a 500.
- `ENABLE_DESIGN_PAGE=true` turns on `/design`. It is read at build time (Cache Components prerenders the page), so changing it needs a new build; set it explicitly to `false` to test the 404, since the local `.env` sets it on.
- `utils.ts` holds `cn()` (clsx plus tailwind-merge) for class names; shadcn components import it.
- Abuse limits come from env with these defaults: 3 tool runs a day per guest, 20 per IP (loose, Nigerian carriers share IPs), 40 messages per run, 4,000 characters per message, and a `maxOutputTokens` ceiling on every AI call. Hitting a limit shows a friendly message, never an error.
- Spend cap: after each AI call, `onFinish` adds usage tokens times the `ai-cost.ts` price into an Upstash Redis counter keyed by UTC day. Over `AI_DAILY_SPEND_CAP_USD`, new guest runs pause; signed in users continue.
- `logEvent` takes an event name plus ids, counts, and flags only; never message content, answers, or secrets.
- Upstash Redis lives in `eu-central-1` and is shared with `resumable-stream`; namespace keys with a clear prefix per use.

## Agent skills

- [upstash-ratelimit-js](../../.claude/skills/upstash-ratelimit-js/): `upstash/skills`, rate limiting with `@upstash/ratelimit`
- [upstash-redis-js](../../.claude/skills/upstash-redis-js/): `upstash/skills`, Redis client, counters, keys

Declined: Upstash MCP

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
