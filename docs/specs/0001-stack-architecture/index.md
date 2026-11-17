# 0001. Stack and architecture for the BeamX Workspace

**Date**: 2026-11-17
**Status**: Accepted

## Summary

The BeamX Workspace is one TypeScript web app (a single codebase that holds the chat UI, the server logic, and the tools), built on Next.js and hosted on Vercel, with a Postgres database on Neon in Frankfurt. The four BeamX tools (Beacon, Beacon Pro, Luna, Stellar) are rebuilt inside the app as plug in modules ported from their source code, so a new tool is added by adding one folder. Claude powers the assistant through the Vercel AI SDK, and Better Auth lets guests start without signing up and keep their work when they do. Everything here is boring, managed, and free or cheap at under 1k runs a month, so a small team can run it without an ops person.

## Decision

**Chosen option**: Option 1: Next.js modular monolith on Vercel + Neon

Build the workspace as a single Next.js 16 app in one repo, with each BeamX tool as a typed code module registered in one place, data in Neon Postgres (Frankfurt) through Drizzle, auth through Better Auth, and AI through the Vercel AI SDK 7 with Anthropic Claude.

**Implementation skills** (all in `.claude/skills/`): `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-dev-loop`, `next-bundle-optimizer` (`vercel/next.js`) · `ai-sdk`, `migrate-ai-sdk-v6-to-v7` (`vercel/ai`) · `ai-elements` (`vercel/ai-elements`) · `shadcn` (`shadcn-ui/ui`) · `neon-drizzle`, `neon-serverless` (`neondatabase/ai-rules`) · `neon-postgres` (`neondatabase/agent-skills`, covers branching) · `better-auth-best-practices`, `create-auth`, `better-auth-security-best-practices`, `email-and-password-best-practices` (`better-auth/skills`) · `upstash-ratelimit-js`, `upstash-redis-js` (`upstash/skills`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | Modular monolith (one deployable app, strict internal folders) | Small team, under 1k runs a month; one deploy is the simplest thing to build, debug, and run. |
| Repo shape | Single app, single package (no monorepo) | No second app is near; folders can be lifted into a monorepo if the staff console arrives. |
| Language | TypeScript (strict mode) | The team's strongest language, one language across UI, server, and tools. |
| Runtime / package manager | Node 24 LTS, pnpm; `packageManager` and `engines` set in `package.json`, Vercel project Node set to 24 | AI SDK 7 needs Node 22+; pnpm is fast and strict about dependencies. |
| Framework | Next.js 16 App Router (exact latest patch pinned), Cache Components on; chat and account routes stay dynamic | Best home for streaming AI chat and a server rendered landing page; Cache Components become the default in Next 17, so start there. Frequent security patches, so pin and bump deliberately. |
| AI layer | Vercel AI SDK 7 (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`) | One API for streaming, tool calling, and structured output; switching provider is a one line change. |
| AI provider | Anthropic Claude (single provider) | Strong at long structured reports and tool calling; exact models per task are set in the assistant brain spec. |
| Primary DB | Neon Postgres, region `aws-eu-central-1` (Frankfurt) | Relational data (users, runs, reports), serverless scale to zero, branch databases per preview deploy. |
| ORM / migrations | Drizzle ORM 0.45 (pinned) + Drizzle Kit, Neon serverless driver | Light and SQL shaped, fast cold starts, first class with Neon and Better Auth; move to v1 only once it is stable. |
| Validation | Zod | One schema for tool answers, API input, AI structured output, and env vars. |
| Auth | Better Auth with the `anonymous` plugin, tables in Neon | Guests get a real user row; `onLinkAccount` moves their runs on sign up (feature #8); user data stays in our DB for NDPA/GDPR export and delete. |
| UI base | Tailwind CSS v4 + shadcn/ui (Radix based) | Components live in the repo and are fully ours; accessible by default. The BeamX look is decided in feature #4. |
| Long running work | Stream inline from route handlers now; add Inngest in slice 5 (PDF + email, retries) | Fewest moving parts for the tracer bullet; durable jobs arrive when work leaves the request. |
| Email | Resend + React Email | Templates as React components; plugs into Better Auth email hooks. |
| PDF | `@react-pdf/renderer` (slice 5) | Renders inside a normal serverless function; no Chromium binary. |
| File storage | Vercel Blob, private access | Same platform as hosting; private blobs for uploads (slice 6) and PDFs. |
| Abuse protection | Upstash Redis (`eu-central-1`) rate limiting + Vercel BotID on guest start and the chat route + a daily AI spend cap (see Runtime rules) | Guests can trigger paid AI calls for free; this caps both scripted abuse and the bill. |
| Hosting | Vercel **Pro** plan, Fluid compute on, functions in `fra1` (Frankfurt) | Native Next.js host, preview deploys, long streaming responses; Hobby forbids commercial use, and a lead funnel is commercial. |
| Scheduled jobs | Vercel Cron | Free, no new vendor; runs the guest data purge. |
| Testing | Vitest (unit and tool parity tests), Playwright (end to end) | Parity with the original tools is required; `/test` may refine. |
| CI | GitHub Actions: typecheck, lint, test, build on every PR; Vercel does deploys | Catches breakage before a preview deploy. |
| Local dev DB | One Neon dev branch per developer, same driver as prod | No driver switch, no Docker; dev matches prod. |
| Observability | Vercel runtime logs and Observability only (for now) | Zero setup at this scale; a dedicated error tracker is a later decision (scope Deferred: analytics & error monitoring). |
| API shape | Next.js route handlers for chat streaming; Server Actions for app mutations; no public REST or GraphQL API | The only client is our own UI; a public API is not needed. |

### App layout (the module boundaries `/develop` must keep)

```
src/
  app/            routes only: pages, layouts, route handlers (thin, call into modules below)
  assistant/      the chat brain: routing to a tool, asking questions as cards, follow ups
  tools/
    registry.ts   the one list of installed tools
    _contract.ts  the ToolModule type every tool implements
    stellar/      questions, scoring, report prompt, report view (one folder per tool)
    beacon/  beacon-pro/  luna/
  db/             Drizzle schema, client, migrations
  auth/           Better Auth server + client config
  lib/            env (Zod), rate limit, AI spend cap, shared helpers
  components/     shadcn/ui and shared UI
  email/  pdf/    added in slice 5
```

Rules:
- Routes never hold business logic; they call `assistant/`, `tools/`, or `db/`.
- A tool folder never imports another tool. The assistant reaches tools only through `tools/registry.ts`.
- Scoring in a tool module is a pure function (answers in, scores out, no AI or DB). Only the report step calls AI. This keeps scores deterministic and testable against the original tools.
- The exact `ToolModule` contract (fields, result shape, how reports stream) is decided in the tool connection layer spec (feature #5). This spec fixes only that tools are code modules behind one registry.

### Runtime rules (stack level, every feature honors these)

- **Time limits**: the chat route sets `maxDuration = 300` (seconds). A report that cannot finish inside that moves to Inngest.
- **Stream persistence**: chat messages and reports are saved on the server in the AI SDK `onFinish` callback, never by the client. A refresh mid stream resumes through `resumable-stream` on the same Upstash Redis. Feature #7 builds it; this spec fixes the pattern.
- **AI failures**: AI SDK `maxRetries: 2`; on timeout or provider overload the chat shows a "try again" card, never a blank or a 500. Model ids live in one file, `src/assistant/models.ts`.
- **Abuse limits** (defaults, all from env): per guest 3 tool runs a day; per IP 20 tool runs a day (loose, because Nigerian mobile carriers share IPs); 40 messages per run; 4,000 characters per message; a `maxOutputTokens` ceiling on every AI call. Hitting a limit shows a friendly message with a sign up or come back later prompt. BotID has a local dev bypass.
- **Spend cap**: after each AI call, `onFinish` adds `usage` tokens times a price table in `src/lib/ai-cost.ts` to a Redis counter keyed by UTC day. Over `AI_DAILY_SPEND_CAP_USD`, new guest runs pause with a friendly message; signed in users continue. Backstop: a hard monthly spend limit set in the Anthropic console.
- **Migrations**: `drizzle-kit migrate` runs in the Vercel build step against `DATABASE_URL_UNPOOLED`. Each preview deploy migrates its own Neon branch.
- **Guest data retention**: a daily Vercel Cron job deletes anonymous users (and their runs) never linked to an account after 30 days.
- **Cookies**: the guest session cookie is strictly necessary (no consent needed); tracking cookies wait for feature #18.

### Configuration required

Required from the scaffold on:
- `DATABASE_URL`: Neon pooled connection (app queries); each preview deploy gets a branch database through the Vercel and Neon integration
- `DATABASE_URL_UNPOOLED`: Neon direct connection (migrations only)
- `BETTER_AUTH_SECRET`: auth signing secret
- `NEXT_PUBLIC_APP_URL`: public base URL; Better Auth uses it as `baseURL`, with `trustedOrigins` also allowing the `VERCEL_URL` of preview deploys
- `ANTHROPIC_API_KEY`: Claude access
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: rate limits, spend counter, resumable streams
- `AI_DAILY_SPEND_CAP_USD`, `RATE_LIMIT_GUEST_RUNS_PER_DAY`, `RATE_LIMIT_IP_RUNS_PER_DAY`, `RATE_LIMIT_MESSAGES_PER_RUN`: defaults above
- `CRON_SECRET`: protects the purge cron route

Optional until their slice: `RESEND_API_KEY` (email), `BLOB_READ_WRITE_TOKEN` (storage), `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (jobs).

All env vars are read through one Zod checked module in `src/lib/env.ts`: required vars fail the app at boot, optional ones fail only when their feature is used. `SKIP_ENV_VALIDATION=1` allows `next build` in CI without secrets. A `.env.example` lists every var.

## Consequences

**Positive**:
- One language, one repo, one deploy: any engineer can trace a chat message from UI to DB in a single codebase.
- Adding a tool means adding a folder and one registry line.
- Everything is managed and free or cheap at this scale; no servers to patch.
- Guest to account carryover is built into the auth library rather than hand written.

**Negative / tradeoffs**:
- Rebuilding the tools creates a second copy of each tool's logic while the standalone tools keep running. Scores can drift if one side changes. Parity tests against the originals are required (see Follow-up).
- Heavy Vercel lock in (hosting, Blob, BotID, preview branching). Leaving later means replacing those pieces, not the app.
- Serverless limits apply: no long lived connections, and function time limits. Any report that cannot finish inside one streamed request must move to Inngest earlier than slice 5.
- Client answers go to Anthropic (US) for AI processing, even though data is stored in Frankfurt. This must be disclosed in the privacy notice (feature #18).
- Vercel only logging means weaker error alerts until a dedicated tracker is added.
- Drizzle is pre 1.0; a v1 upgrade will need a planned migration pass.
- Frankfurt is about 150 to 250 ms from Nigeria: keep DB calls per request few and parallel, never a chain of sequential queries.
- Neon free tier scales to zero, so the first request after idle is slower; plan a paid Neon plan before public launch.
- Fixed running cost from day one: Vercel Pro (per seat) plus AI usage.
- `@react-pdf/renderer` has limited layout and font support; matching the standalone tools' branded PDFs exactly may be hard (feature #15 decides).

**Neutral**:
- Feature #5 (tool connection layer) changes meaning: it is now a module contract and registry for in app tools, not a bridge to live services.
- AI SDK 7 is ESM only and requires Node 22+; all config files are ESM.

## Follow-up

- [ ] Update scope feature #5 (Tool connection layer) to say the tools are rebuilt in app as modules ported from source, not called as live services (`/scope` owns the edit).
- [ ] Get read access to the source repos of Beacon, Beacon Pro, Luna, and Stellar before their slices start; capture golden fixtures (real answer sets with the original scores and verdicts) for parity tests.
- [ ] Decide the exact `ToolModule` contract: `/architect tool connection layer`.
- [ ] Record the Agent Skills and MCP choices in root `AGENTS.md` `## Agent skills` (`/audit` writes it in feature #2): framework, AI SDK, shadcn, Neon, and Drizzle skills at root; Better Auth skills in `src/auth/AGENTS.md`; Upstash skills in `src/lib/AGENTS.md`. `MCP servers:` Neon, Vercel (already connected). `Declined:` Better Auth docs MCP, Upstash MCP, Resend MCP, Inngest MCP.
- [ ] Skills not installed yet, to offer when their slice starts: Resend + React Email (`resend/resend-skills`) in slice 5, Inngest (`inngest/inngest-skills`) in slice 5. No official skill exists for Drizzle, Tailwind v4, Vercel Blob, or `@react-pdf/renderer`.
- [ ] Revisit error monitoring (for example Sentry) before the public launch.
- [ ] At scaffold time, confirm the Better Auth Drizzle adapter supports Drizzle 0.45, and that Neon and Vercel Blob offer Frankfurt on your account.
- [ ] Hand feature #18 the processor list for the privacy notice: Vercel, Neon, Upstash, Resend, Anthropic (US transfer).

## Rationale

Reasoning, options considered, and references: see [rationale.md](rationale.md).
