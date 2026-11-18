<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BeamX Workspace

## Stack

From [spec 0001](docs/specs/0001-stack-architecture/index.md) (source of truth).

- **Language / Runtime**: TypeScript (strict), Node 24 LTS
- **Framework**: Next.js 16 App Router (exact patch pinned), Cache Components on; modular monolith, single package
- **Key dependencies**: Vercel AI SDK 7 + Anthropic Claude · Neon Postgres (Frankfurt) via Drizzle ORM 0.45 · Better Auth (`anonymous` plugin) · Zod · Tailwind v4 + shadcn/ui · Upstash Redis (rate limits, spend cap)
- **Package manager**: pnpm
- **Hosting**: Vercel Pro, functions in `fra1`. Tests: Vitest + Playwright. CI: GitHub Actions.

## Build approach

**Tracer Bullet**: get one real thread working end to end through every layer first, then thicken it one strand at a time.

## Commands

```bash
pnpm install      # install
pnpm dev          # dev server
pnpm build        # production build
pnpm lint         # ESLint
pnpm typecheck    # next typegen + tsc --noEmit
pnpm test         # Vitest unit tests
pnpm test:integration  # DB integration tests, against a throwaway Neon branch
pnpm db:generate  # write a migration after a schema change (CI fails on drift)
pnpm db:migrate   # apply migrations
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/` (`index.md` + `rationale.md`). Scope lives in `docs/scope/scope.md`.

## Rules

- Keep the module boundaries of spec 0001: `src/app/` is routes only and calls into `assistant/`, `tools/`, `db/`; a tool folder never imports another tool; the assistant reaches tools only through `tools/registry.ts`.
- Functional style: pure functions by default, no shared mutable state, immutable data (`const`, `readonly`); prefer plain functions and composition over classes.
- Push side effects (DB, AI calls, Redis, I/O) to the edges: route handlers, Server Actions, `onFinish`. Tool scoring is pure (answers in, scores out), with no AI or DB.
- Expected failures return typed results (`{ ok: true, value } | { ok: false, error }`), not thrown exceptions; the UI turns them into friendly cards, never a blank screen or a 500.
- Every env var is read through the Zod checked `src/lib/env.ts`, never `process.env` directly. List new vars in `.env.example`.
- Validate every boundary (tool answers, API input, AI structured output) with Zod.
- TypeScript extra strict: no `any`, `noUncheckedIndexedAccess`, exhaustive `switch` on unions (`never` check).
- Model ids live only in `src/assistant/models.ts`. Keep DB calls per request few and parallel (Frankfurt is far from Nigeria).
- Conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Tests come with each feature: Vitest unit tests for pure logic, parity tests against original tool fixtures, Playwright for key flows.

## Tooling

Chosen here, installed by `/develop tooling`: ESLint (`eslint-config-next`, installed) + Prettier with `prettier-plugin-tailwindcss` · husky + lint-staged pre commit: lint and format staged files, then typecheck · TS flags `noUncheckedIndexedAccess` (+ ESLint `no-explicit-any`, `switch-exhaustiveness-check`) · GitHub Actions on every PR: typecheck, lint, test, build.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

## Agent skills

- [next-cache-components-adoption](.claude/skills/next-cache-components-adoption/): `vercel/next.js`, turning on and fixing Cache Components
- [next-cache-components-optimizer](.claude/skills/next-cache-components-optimizer/): `vercel/next.js`, growing the static shell and instant navigation
- [next-dev-loop](.claude/skills/next-dev-loop/): `vercel/next.js`, verifying changes in a running `next dev`
- [next-bundle-optimizer](.claude/skills/next-bundle-optimizer/): `vercel/next.js`, client bundle size
- [ai-sdk](.claude/skills/ai-sdk/): `vercel/ai`, streaming, tool calling, structured output
- [migrate-ai-sdk-v6-to-v7](.claude/skills/migrate-ai-sdk-v6-to-v7/): `vercel/ai`, AI SDK 7 APIs (avoid v6 patterns)
- [ai-elements](.claude/skills/ai-elements/): `vercel/ai-elements`, chat UI components
- [shadcn](.claude/skills/shadcn/): `shadcn-ui/ui`, UI components and styling
- [neon-drizzle](.claude/skills/neon-drizzle/): `neondatabase/ai-rules`, Drizzle schema and migrations on Neon
- [neon-serverless](.claude/skills/neon-serverless/): `neondatabase/ai-rules`, Neon serverless driver
- [neon-postgres](.claude/skills/neon-postgres/): `neondatabase/agent-skills`, connections, branching, Postgres ops
- [vitest](.claude/skills/vitest/): `antfu/skills`, Vitest unit and parity tests
- [playwright-cli](.claude/skills/playwright-cli/): `microsoft/playwright-cli`, browser automation and end to end tests

Declined: Better Auth docs MCP, Upstash MCP, Resend MCP, Inngest MCP, Playwright MCP
MCP servers: Neon (connected), Vercel (connected)

## Context files

- [src/auth/AGENTS.md](src/auth/AGENTS.md): Better Auth setup, guest (anonymous) users, account linking
- [src/lib/AGENTS.md](src/lib/AGENTS.md): env, rate limits, AI spend cap, shared helpers
- [src/db/AGENTS.md](src/db/AGENTS.md): Drizzle schema, migrations, the typed query layer, DB integration tests

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
