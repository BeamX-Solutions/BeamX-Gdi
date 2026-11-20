# Verify: Tool module contract and registry · spec 0005 · updated 2026-11-20

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 2: AI SDK 7, models, cost, spend cap, report queries, runner

### Commands

- [ ] `pnpm typecheck` and `pnpm lint` → clean (no `any`, no tool folder importing outside the contract, the kit, `zod` and `@/lib/result`) → AC-14
- [ ] `pnpm test` → `src/assistant/models.test.ts` passes: role `report` is `claude-opus-5-5` at effort `medium`, and every id in `models.ts` has a price in `ai-cost.ts` → AC-12, AC-14
- [ ] `pnpm test` → `src/assistant/report-runner.test.ts` passes (phases in order, resume, repair, error kinds, spend cap, overlap, crash) → AC-8, AC-9, AC-12
- [ ] On a throwaway Neon branch (never `dev` or `production`): export its `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then `pnpm test:integration` → `src/db/queries/report-phases.int.test.ts` passes → AC-8, AC-10, AC-15

### Runner behavior (mock model)

- [ ] Three phase tool: phase 2's prompt contains phase 1's output, phase 3's contains phase 2's; `report.content` holds all three keys before `markReady` → AC-8
- [ ] Phase 2 fails with a 529: the report is `failed` with kind `provider_overloaded` and keeps phase 1's output; the retry (attempt 2) makes no call for phase 1 → AC-8, AC-9
- [ ] A saved phase whose output no longer parses runs again → AC-8
- [ ] Invalid then valid output: ready, two `ai_usage` rows with keys `report:<runId>:<attempt>:<phase>:1` and `:2`; invalid twice: `invalid_output` → AC-9, AC-12
- [ ] A phase that outlives its `timeoutMs`: kind `timeout`, no usage row → AC-9, AC-12
- [ ] A plain error from the model, or a throw from any dependency (for example `savePhase`): the report ends `failed` with kind `unknown`, never stuck `generating` → AC-9
- [ ] The third failed attempt releases the hold, and nothing is charged → AC-9
- [ ] `checkSpendCap` refuses: kind `spend_cap`, zero model calls → AC-12
- [ ] The attempt is reclaimed between phases: the old runner stops before its next phase, makes no more calls, and writes nothing → AC-7, AC-12

### Queries (integration)

- [ ] `reports.savePhase` merges keys into `content`; a wrong attempt or a non `generating` report returns `stale_attempt`; saved keys survive a retry → AC-8
- [ ] `reports.status` returns tool id, version, status, attempts, error, sorted phase keys and `hasHold`; `stale` turns true after 10 minutes of `generating`; another user, an unknown run, or a run with no report row gives `not_found` → AC-10
- [ ] `reports.failStale` on a `generating` report at attempt 3 that is 11 minutes old: `failed` with kind `timeout`, hold `released`; not stale, attempts left, or another user's run: nothing changes and the hold stays `active` → AC-15

### Value sourcing

- [ ] runner model id: the `markReady` model and every usage row's `model` are `claude-opus-5-5` from `models.ts`; no tool file names a model → value row "runner, model id"
- [ ] runner usage cost: 1000 input and 50 output tokens on Opus 5.5 record `costUsd` `0.005000`; cache read and write tokens are priced apart ($0.20 and $5 per million) → value row "runner, usage cost"
- [ ] runner `callKey`: `report:<runId>:<attempt>:<phaseKey>:<try>`, with `try` 2 only for the repair call → value row "runner, usage callKey"
- [ ] runner `attempt`: every write (`savePhase`, `markReady`, `markFailed`) uses the claimed attempt; a write with an older attempt is refused → value row "runner, attempt"
- [ ] runner owner: usage rows carry the user from `runs.ownerOf`, not the request session (link a guest mid run and check the row's `user_id`) → value row "runner, run owner"
- [ ] runner prompt inputs: hidden answers never reach the prompt (Stellar `commitment` `maybe` with a stored `commitment_detail`: no follow up text in the prompt); answers sit inside `<client_data>` → value row "runner, each phase"

## Acceptance criteria coverage (this milestone)

- AC-8: runner order, resume, savePhase steps · AC-9: error kinds, repair, crash, third attempt · AC-10: status query (the GET route comes in milestone 3) · AC-12: usage rows, cost, spend cap, overlap · AC-14: lint rule and model roles · AC-15: failStale (the POST route comes in milestone 3)
