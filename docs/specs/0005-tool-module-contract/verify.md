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

## Milestone 3: report routes (POST and GET `/api/runs/[runId]/report`)

### Commands

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` → clean; `src/assistant/report-status.test.ts` passes (phases, error kinds, canRetry, view) → AC-10, AC-13
- [ ] `SKIP_ENV_VALIDATION=1 pnpm build` → `/api/runs/[runId]/report` listed as dynamic (ƒ) → AC-7
- [ ] On a throwaway Neon branch (never `dev` or `production`): `pnpm test:integration` → `src/assistant/report-api.int.test.ts` passes → AC-7, AC-8, AC-10, AC-13, AC-15

### Route behavior

- [ ] POST on a completed, funded run → `202`, `status: "generating"`, every phase `done: false`; no AI call before the response; the phases then run in `after()`, the report turns `ready`, and the hold is `charged` → AC-7, AC-8
- [ ] GET after that → `200`, `status: "ready"`, every phase done, `view` holds the tool's blocks; a second POST → `200` and nothing is scheduled → AC-7, AC-10
- [ ] Two POSTs at once → both `202`, one runner scheduled, one set of AI calls, `attempts` 1 → AC-7
- [ ] Another user's run, an unknown run, or a run not completed yet → `404` `{ code: "not_found" }` on POST and GET, nothing changes → AC-7, AC-10
- [ ] A bad uuid → `400` `invalid_run_id`; no session → `401` `unauthenticated` → API surface
- [ ] A run stored with an older tool version → POST `409` `version_changed`, `attempts` stays 0, the hold stays `active` → AC-7
- [ ] Phase 2 fails with a 529 → GET shows `failed`, `canRetry: true`, kind `provider_overloaded` with the friendly copy, phase 1 done; the retry POST makes no call for phase 1 → AC-8, AC-10
- [ ] A report reclaimed after going stale → the old runner stops before its first phase with no AI call; the new attempt finishes → AC-7, AC-12
- [ ] The last attempt still running → POST `202`, nothing scheduled; the last attempt stale for 11 minutes → POST `409` `attempts_exhausted`, the hold `released`, GET shows kind `exhausted` ("We could not make this report", "Your credits were returned.") with no retry → AC-15
- [ ] A ready report stored as version `0` → drawn by `readers["0"]`, `phases: []`; an unknown version or content that fails its schema → `error.kind: "stored_data_invalid"`, no `view`, no retry → AC-13

### Value sourcing

- [ ] GET `phases[].done`: phase key present in `report.content` (fail at phase 2, see phase 1 done and phase 2 not) → value row "GET, phases[].done"
- [ ] GET `phases[].label`: from the current module; an old version gives an empty list → value row "GET, phases[].label, total"
- [ ] GET `canRetry`: true only for failed (or stale) with attempts left, an active hold and a current version; false at attempt 3, without a hold, or on an old version → value row "GET, canRetry"
- [ ] GET `stale`: true only when `generating` and older than 10 minutes by the DB clock → value row "GET, stale"
- [ ] GET error message: from `reportErrorCopy`; a stored message such as "secret" never appears in the body → value row "GET, error message"
- [ ] GET `view`: `reader.toView` after parsing answers, scores and content with the reader for the stored version → value row "GET, view"
- [ ] runner `attempt`: the claimed row's `attempts` (a reclaim gives 2 and the old runner's writes are refused) → value row "runner, attempt"

## Acceptance criteria coverage (milestone 3)

- AC-7: POST claim, 202/200/404/409, concurrency, overlap · AC-10: GET payload, owner only 404 · AC-13: old version reader, `stored_data_invalid` · AC-15: stale last attempt fails and releases the hold. AC-11 (the panel) comes in milestone 4.
