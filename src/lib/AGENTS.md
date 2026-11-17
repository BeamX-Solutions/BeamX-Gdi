# Lib

## Overview

Shared server helpers every feature leans on: the Zod checked env module, rate limits, the daily AI spend cap, and small shared utilities. Not built yet; this records the rules from spec 0001.

## Key files

| File         | Owns                                                       |
| ------------ | ---------------------------------------------------------- |
| `env.ts`     | The only place env vars are read; Zod schema for every var |
| `ai-cost.ts` | Price table used to turn AI `usage` tokens into dollars    |

## Conventions

- `env.ts`: required vars fail the app at boot; optional ones (`RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `INNGEST_*`) fail only when their feature is used. `SKIP_ENV_VALIDATION=1` lets `next build` run in CI without secrets. Every var is listed in `.env.example`.
- Abuse limits come from env with these defaults: 3 tool runs a day per guest, 20 per IP (loose, Nigerian carriers share IPs), 40 messages per run, 4,000 characters per message, and a `maxOutputTokens` ceiling on every AI call. Hitting a limit shows a friendly message, never an error.
- Spend cap: after each AI call, `onFinish` adds usage tokens times the `ai-cost.ts` price into an Upstash Redis counter keyed by UTC day. Over `AI_DAILY_SPEND_CAP_USD`, new guest runs pause; signed in users continue.
- Upstash Redis lives in `eu-central-1` and is shared with `resumable-stream`; namespace keys with a clear prefix per use.

## Agent skills

- [upstash-ratelimit-js](../../.claude/skills/upstash-ratelimit-js/): `upstash/skills`, rate limiting with `@upstash/ratelimit`
- [upstash-redis-js](../../.claude/skills/upstash-redis-js/): `upstash/skills`, Redis client, counters, keys

Declined: Upstash MCP

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
