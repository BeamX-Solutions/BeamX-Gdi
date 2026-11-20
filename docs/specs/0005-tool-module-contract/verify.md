# Verify: Tool module contract and registry · spec 0005 · updated 2026-11-20

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 2: AI SDK 7, models, cost, spend cap, report queries, runner

### Commands

- [x] `pnpm typecheck` and `pnpm lint` → clean (no `any`, no tool folder importing outside the contract, the kit, `zod` and `@/lib/result`) → AC-14
- [x] `pnpm test` → `src/assistant/models.test.ts` passes: role `report` is `claude-opus-5-5` at effort `medium`, and every id in `models.ts` has a price in `ai-cost.ts` → AC-12, AC-14
- [x] `pnpm test` → `src/assistant/report-runner.test.ts` passes (phases in order, resume, repair, error kinds, spend cap, overlap, crash) → AC-8, AC-9, AC-12
- [x] On a throwaway Neon branch (never `dev` or `production`): export its `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then `pnpm test:integration` → `src/db/queries/report-phases.int.test.ts` passes → AC-8, AC-10, AC-15

### Runner behavior (mock model)

- [x] Three phase tool: phase 2's prompt contains phase 1's output, phase 3's contains phase 2's; `report.content` holds all three keys before `markReady` → AC-8
- [x] Phase 2 fails with a 529: the report is `failed` with kind `provider_overloaded` and keeps phase 1's output; the retry (attempt 2) makes no call for phase 1 → AC-8, AC-9
- [x] A saved phase whose output no longer parses runs again → AC-8
- [x] Invalid then valid output: ready, two `ai_usage` rows with keys `report:<runId>:<attempt>:<phase>:1` and `:2`; invalid twice: `invalid_output` → AC-9, AC-12
- [x] A phase that outlives its `timeoutMs`: kind `timeout`, no usage row → AC-9, AC-12
- [x] A plain error from the model, or a throw from any dependency (for example `savePhase`): the report ends `failed` with kind `unknown`, never stuck `generating` → AC-9
- [x] The third failed attempt releases the hold, and nothing is charged → AC-9
- [x] `checkSpendCap` refuses: kind `spend_cap`, zero model calls → AC-12
- [x] The attempt is reclaimed between phases: the old runner stops before its next phase, makes no more calls, and writes nothing → AC-7, AC-12

### Queries (integration)

- [x] `reports.savePhase` merges keys into `content`; a wrong attempt or a non `generating` report returns `stale_attempt`; saved keys survive a retry → AC-8
- [x] `reports.status` returns tool id, version, status, attempts, error, sorted phase keys and `hasHold`; `stale` turns true after 10 minutes of `generating`; another user, an unknown run, or a run with no report row gives `not_found` → AC-10
- [x] `reports.failStale` on a `generating` report at attempt 3 that is 11 minutes old: `failed` with kind `timeout`, hold `released`; not stale, attempts left, or another user's run: nothing changes and the hold stays `active` → AC-15

### Value sourcing

- [x] runner model id: the `markReady` model and every usage row's `model` are `claude-opus-5-5` from `models.ts`; no tool file names a model → value row "runner, model id"
- [x] runner usage cost: 1000 input and 50 output tokens on Opus 5.5 record `costUsd` `0.005000`; cache read and write tokens are priced apart ($0.20 and $5 per million) → value row "runner, usage cost"
- [x] runner `callKey`: `report:<runId>:<attempt>:<phaseKey>:<try>`, with `try` 2 only for the repair call → value row "runner, usage callKey"
- [x] runner `attempt`: every write (`savePhase`, `markReady`, `markFailed`) uses the claimed attempt; a write with an older attempt is refused → value row "runner, attempt"
- [ ] runner owner: usage rows carry the user from `runs.ownerOf`, not the request session (link a guest mid run and check the row's `user_id`) → value row "runner, run owner"
- [ ] runner prompt inputs: hidden answers never reach the prompt (Stellar `commitment` `maybe` with a stored `commitment_detail`: no follow up text in the prompt); answers sit inside `<client_data>` → value row "runner, each phase"

## Acceptance criteria coverage (this milestone)

- AC-8: runner order, resume, savePhase steps · AC-9: error kinds, repair, crash, third attempt · AC-10: status query (the GET route comes in milestone 3) · AC-12: usage rows, cost, spend cap, overlap · AC-14: lint rule and model roles · AC-15: failStale (the POST route comes in milestone 3)

## Milestone 3: report routes (POST and GET `/api/runs/[runId]/report`)

### Commands

- [x] `pnpm typecheck`, `pnpm lint` and `pnpm test` → clean; `src/assistant/report-status.test.ts` passes (phases, error kinds, canRetry, view) → AC-10, AC-13
- [x] `SKIP_ENV_VALIDATION=1 pnpm build` → `/api/runs/[runId]/report` listed as dynamic (ƒ) → AC-7
- [x] On a throwaway Neon branch (never `dev` or `production`): `pnpm test:integration` → `src/assistant/report-api.int.test.ts` passes → AC-7, AC-8, AC-10, AC-13, AC-15

### Route behavior

- [x] POST on a completed, funded run → `202`, `status: "generating"`, every phase `done: false`; no AI call before the response; the phases then run in `after()`, the report turns `ready`, and the hold is `charged` → AC-7, AC-8
- [x] GET after that → `200`, `status: "ready"`, every phase done, `view` holds the tool's blocks; a second POST → `200` and nothing is scheduled → AC-7, AC-10
- [x] Two POSTs at once → both `202`, one runner scheduled, one set of AI calls, `attempts` 1 → AC-7
- [x] Another user's run, an unknown run, or a run not completed yet → `404` `{ code: "not_found" }` on POST and GET, nothing changes → AC-7, AC-10
- [x] A bad uuid → `400` `invalid_run_id`; no session → `401` `unauthenticated` → API surface
- [x] A run stored with an older tool version → POST `409` `version_changed`, `attempts` stays 0, the hold stays `active` → AC-7
- [x] Phase 2 fails with a 529 → GET shows `failed`, `canRetry: true`, kind `provider_overloaded` with the friendly copy, phase 1 done; the retry POST makes no call for phase 1 → AC-8, AC-10
- [x] A report reclaimed after going stale → the old runner stops before its first phase with no AI call; the new attempt finishes → AC-7, AC-12
- [x] The last attempt still running → POST `202`, nothing scheduled; the last attempt stale for 11 minutes → POST `409` `attempts_exhausted`, the hold `released`, GET shows kind `exhausted` ("We could not make this report", "Your credits were returned.") with no retry → AC-15
- [x] A ready report stored as version `0` → drawn by `readers["0"]`, `phases: []`; an unknown version or content that fails its schema → `error.kind: "stored_data_invalid"`, no `view`, no retry → AC-13

### Value sourcing

- [x] GET `phases[].done`: phase key present in `report.content` (fail at phase 2, see phase 1 done and phase 2 not) → value row "GET, phases[].done"
- [x] GET `phases[].label`: from the current module; an old version gives an empty list → value row "GET, phases[].label, total"
- [x] GET `canRetry`: true only for failed (or stale) with attempts left, an active hold and a current version; false at attempt 3, without a hold, or on an old version → value row "GET, canRetry"
- [x] GET `stale`: true only when `generating` and older than 10 minutes by the DB clock → value row "GET, stale"
- [x] GET error message: from `reportErrorCopy`; a stored message such as "secret" never appears in the body → value row "GET, error message"
- [x] GET `view`: `reader.toView` after parsing answers, scores and content with the reader for the stored version → value row "GET, view"
- [x] runner `attempt`: the claimed row's `attempts` (a reclaim gives 2 and the old runner's writes are refused) → value row "runner, attempt"

## Acceptance criteria coverage (milestone 3)

- AC-7: POST claim, 202/200/404/409, concurrency, overlap · AC-10: GET payload, owner only 404 · AC-13: old version reader, `stored_data_invalid` · AC-15: stale last attempt fails and releases the hold. AC-11 (the panel) comes in milestone 4.

## Milestone 4: report blocks, renderer, panel states, contract test

### Commands

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm check:colors` and `pnpm test` → clean → AC-1, AC-11
- [x] `src/tools/contract.test.ts` passes: the production registry has no violations, and the test tools (sample, three phase, and the two module `pair/` folder) plug in with one list entry each → AC-1
- [x] In the same test, each broken module is caught: duplicate tool id, duplicate question id, `creditPrice` 0, negative, 2.5 or NaN, duplicate phase keys, a phase key missing from `contentSchema` (and a content key no phase writes), a non object `contentSchema`, a `when` that throws on empty answers, a phase `timeoutMs` over 240000, phases needing more than 780000ms → AC-1
- [x] `src/components/report/report-panel-state.test.ts` passes: poll 2s then 5s after 30s; polling stops on ready, failed and stale; stale always offers Retry; `exhausted`, `no_credit_hold` and `version_changed` are final; a ready report with no view is final → AC-11, AC-13
- [x] `src/components/report/safe-link.test.ts` passes: only `https:` survives (`http:`, `javascript:`, `data:`, relative and junk are dropped) → AC-11 (security model)
- [x] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → all pass in the four projects, including the axe scan of the report section → AC-11

### UI / manual (on `/design`, section "Report panel states")

- [x] Generating → skeleton with three steps: one Done, one In progress, one Waiting → AC-11
- [x] Failed, can retry → friendly "That did not work" card; press Retry → the skeleton shows and "Retries: 1" appears → AC-11
- [x] Failed, credits returned → "We could not make this report" and "Your credits were returned", no Retry, one "Start again" button → AC-11
- [x] Ready → all seven block kinds drawn (score 74/100 with "Needs work", bars, next steps, plan, strengths, roadmap, resources) → AC-11
- [x] In the ready report, "[this](https://example.com)" in "Your plan" is plain text; in Resources only "Pricing guide" is a link (new tab, `rel="noopener noreferrer nofollow"`), the http and script items are plain text → AC-11
- [x] Repeat at 360px wide and in dark theme → no sideways scroll, every state readable → AC-11

### Live panel (once #7 mounts `LiveReport` for a real run)

- [ ] Start a report → the panel polls `GET /api/runs/<id>/report` about every 2s, slowing to 5s after 30s, and stops once ready or failed (watch the network tab) → AC-11
- [ ] Turn the network off while generating → the "You look offline" card with Retry, never a blank panel → AC-11
- [ ] A ready report whose stored content no longer parses → "We could not open this report" with Start again, no Retry → AC-13

### Value sourcing

- [x] `phases[].done` → the skeleton ticks exactly the phases whose keys are saved in `report.content` (fail the 3 phase test tool at phase 2: step one Done, step two In progress) → value row "GET phases[].done"
- [x] Poll interval → constants `POLL_FAST_MS`, `POLL_SLOW_MS`, `POLL_SLOW_AFTER_MS` in `report-panel-state.ts` → value row "panel poll interval"
- [x] Error message → the card text always comes from `error-copy.ts` by kind, never the stored message (store a raw message, check it is not shown) → value row "GET error message"

## Acceptance criteria coverage (milestone 4)

- AC-1: contract test over the registry plus broken and plugged in test tools · AC-11: four panel states, polling, Retry and Start again, renderer, safe links, axe · AC-13: `stored_data_invalid` shown as a final card with no retry
