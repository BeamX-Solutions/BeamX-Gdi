# 0005. Tool module contract and registry

**Date**: 2026-11-20
**Status**: In Progress

## Summary

Every BeamX tool (Stellar, Beacon, Beacon Pro, Luna) becomes one folder under `src/tools/` that describes itself as plain data plus pure functions: its questions, its scoring, its report steps (called phases), how its report looks, and its credit price. One registry file lists the installed tools, and one shared report runner in `src/assistant/` makes the AI calls, so no tool ever talks to the AI or the database itself. This feature ports Stellar as the first real tool, and builds the report route, with its progress, retry and failure states, that every tool will reuse. #7 then only has to wire the chat to it.

## Requirements

**User stories**:
- As a developer, I want to add a tool by adding one folder and one registry line, so new tools never touch the assistant, the database or the UI.
- As a client, I want my report to show its progress, and to recover from a failure with a clear retry, so I never stare at a blank screen or lose my credits to a crash.
- As BeamX, I want the rebuilt tools to score exactly like the originals, so the workspace and the standalone tools never disagree.

**Acceptance criteria**:
- **AC-1**: A tool is one folder `src/tools/<folder>/` exporting one or more `ToolModule`s built with `defineTool`. Adding a module to the list in `src/tools/registry.ts` is the only other change needed for it to be startable, scorable, reportable and viewable. A contract test runs over every registered module and fails on: a duplicate tool id; a duplicate question id within a tool; a `creditPrice` that is not a positive integer; duplicate phase keys; phase keys that do not exactly match the top level keys of `contentSchema`; a `when` predicate that throws when given empty answers.
- **AC-2**: `getTool(id)` returns `{ ok: false, error: { code: "unknown_tool" } }` for an id not in the registry. `getReader(id, version)` returns `unknown_tool` or `unsupported_version` as typed errors. Nothing throws on an unknown id or version.
- **AC-3**: `parseAnswer(tool, questionId, value)` accepts exactly what the card allows. Single: one of the option values. Multi: `min` to `max` distinct option values. Scale: an integer from `min` to `max`. Text: a trimmed string within `maxLength` (number and money inputs: a finite number within `minValue` and `maxValue`). Then it applies the question's optional `refine`. A failure returns `invalid_answer` with the question id and a short reason. An unknown question id returns `unknown_question`.
- **AC-4**: `visibleQuestions(tool, answers)` returns the questions whose `when` passes, in list order. `nextQuestion(tool, answers)` returns the first visible, unanswered question, or `null` when none is left. `progress(tool, answers)` counts visible questions only. For Stellar, `commitment_detail` is visible only when `commitment` is `yes` or `no`. An answer to a question that later becomes hidden is ignored by scoring and prompts.
- **AC-5**: Stellar's port matches all 75 cases in `fixtures/parity/stellar/scoring.json`: score, level, totalPositive, title, summary, actionItems, timeframe and the dimension scores, with the two documented differences (dimensions matched by question id; dimension 8 renamed to "Competitor Awareness").
- **AC-6**: `score(answers)` is pure (no AI, DB, clock or randomness) and never throws. When a visible question is unanswered, it returns `{ ok: false, error: { code: "incomplete", missing: [questionIds] } }`. Luna style tools with no scoring declare an empty scores schema and return `ok({})`.
- **AC-7**: `POST /api/runs/[runId]/report` first checks that the run's `tool_version` is the registry's current version. If not, it returns `409 version_changed` without claiming, so no attempt is used and the hold is untouched. It then claims the report for the session user (spec 0002 `reports.claim`, which requires an active credit hold per spec 0004, and also reclaims a `generating` report that has been stale for 10 minutes). On a successful claim, it returns `202` with the status payload and runs the phases inside `after()`. When the report is already generating (and not stale), it returns `202` with the current status and makes no AI call. When the report is already ready, it returns `200` with the status payload. An unknown run, another user's run, or a run with no report row yet (not completed) returns `404`. Two concurrent POSTs never make two sets of AI calls for the same attempt.
- **AC-8**: Phases run in order. Each phase's prompt receives the visible answers, the scores, and the outputs of earlier phases. Each finished phase output is saved into `report.content` under its key before the next phase starts. A retry after a failure skips phases already saved. When every phase is saved, the merged content is validated against `contentSchema` and written with `reports.markReady`, which charges the hold once (spec 0004, AC-4).
- **AC-9**: When a phase's output fails its schema, the runner retries that phase once in the same attempt, sending the validation errors back. A second failure ends the attempt with `markFailed` kind `invalid_output`. Provider errors map to `provider_overloaded` (overloaded or rate limited), `timeout` (phase timeout or abort), or `unknown`. Any other error thrown inside the runner is caught at the top level and ends the attempt with `markFailed` kind `unknown`, so a report never stays `generating` because of a crash. On the third failed attempt, the hold is released by `markFailed` (spec 0004, AC-5).
- **AC-10**: `GET /api/runs/[runId]/report` returns, for the run's owner only: `status`, `phases` (label and done flag for each), `error` (kind plus a friendly message), `canRetry`, `stale` (true when generating and not updated for 10 minutes), and, when ready, `view` (the tool's report blocks). It reads with the light `reports.status` query on every poll, and the full `runs.get` only when the report is ready. POST and GET build the payload with the same pure `buildStatus` function. `error.kind` is a stored `ReportError` kind, or one of two kinds created at read time: `version_changed` (not ready, and the version is not current) and `stored_data_invalid` (AC-13). Another user's run, or an unknown run, returns `404` with no detail.
- **AC-11**: The report panel shows four states from that payload, never a blank screen or a 500. Generating: the report skeleton with one step per phase, done steps ticked, polling about every 2 seconds and backing off to 5. Failed and retryable, or stale: a friendly error card with a Retry button that POSTs again. Failed after the last attempt: a card saying the report could not be made and the credits were returned, with no Retry. Ready: the blocks drawn by the shared renderer.
- **AC-12**: Every AI call the runner makes writes one `ai_usage` row (`purpose` `report`, idempotent `callKey` `report:<runId>:<attempt>:<phaseKey>:<try>`, cost from `src/lib/ai-cost.ts`), including failed and repair calls that returned usage. The row carries the run owner's `userId` and the `runId`. Before each phase, the runner calls `checkSpendCap(userId)`, which returns `Result<void, { code: "spend_cap" }>`. A refusal fails the attempt with kind `spend_cap` and makes no AI call. A call that throws without usage (a timeout or abort) records nothing; that gap is accepted.
- **AC-13**: A stored run is read with the reader for its `tool_version`: the current module when the versions match, otherwise the module's `readers[version]`. A stored answer, score or content that fails its schema returns `stored_data_invalid`, which the panel shows as a friendly error card (no retry).
- **AC-15**: A POST on a stale `generating` report whose `attempts` is already 3 calls `reports.failStale`. In one statement, that marks the report failed with kind `timeout` and releases the hold (spec 0004, AC-5). The client sees the exhausted card, and the credits are never stuck.
- **AC-16**: `scoreRun(tool, answerRows)` (pure, in `_kit`) parses each stored answer with `parseAnswer`, keeps the visible ones, scores them, and parses the result with `scoresSchema`. It returns `{ scores, answerCount, lastAnswerAt }`, with the count and the raw latest `updated_at` string taken from all stored rows, as `runs.complete` compares them. An unparseable stored answer returns `stored_data_invalid`, and a missing visible answer returns `incomplete`.
- **AC-14**: Tools never name a model id. Each phase names a model role (`report`), and the runner resolves it through `src/assistant/models.ts`. A tool folder imports nothing from `assistant/`, `db/`, `app/` or another tool folder (only `tools/_contract.ts`, `tools/_kit/`, `zod` and `@/lib/result`), and an ESLint `no-restricted-imports` rule enforces this.

## Decision

**Chosen option**: Option 1: Pure tool modules, one shared runner (the reasoning is in [rationale.md](rationale.md)).

Each tool is a typed, side effect free module (questions, pure scoring, ordered report phases with prompt builders and Zod schemas, a pure view model, a credit price). One registry lists them. The report runner in `src/assistant/` owns every AI call, retry, save and charge, and runs from its own route in `after()`, with the panel polling a status read.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### The contract (`src/tools/_contract.ts`)

Shape the build follows. Names are fixed; the exact generic plumbing is the builder's call, as long as `any` is never used.

```ts
type AnswerValue = string | number | readonly string[];      // moved here from components/answer-cards/types.ts
type Answers = Readonly<Record<string, AnswerValue>>;        // question id -> value

type QuestionView = /* the existing single | multi | scale | text union, moved here unchanged */;

type ToolQuestion = QuestionView & {
  readonly area?: string;                                    // progress grouping (Luna squares, Beacon categories)
  readonly when?: (answers: Answers) => boolean;             // pure; hidden when false
  readonly refine?: (value: AnswerValue) => string | null;   // extra rule; returns a reason or null
  readonly factKey?: string;                                 // optional profile fact this answer maps to (#9 uses it to skip known facts)
};

type ReportPhase = {
  readonly key: string;                                      // top level key in content
  readonly label: string;                                    // skeleton step label, plain words
  readonly modelRole: ModelRole;                             // "report" for now; resolved in assistant/models.ts
  readonly maxOutputTokens: number;                          // capped by the runner's global ceiling
  readonly timeoutMs: number;                                // per AI call
  readonly output: z.ZodType;                                // what this phase must return
  readonly buildPrompt: (ctx: {
    readonly answers: Answers;                               // visible answers only
    readonly scores: unknown;                                // parsed by scoresSchema
    readonly earlier: Readonly<Record<string, unknown>>;     // outputs of phases before this one
  }) => { readonly instructions: string; readonly prompt: string };
};

type ToolReader = {                                          // read side of one version
  readonly questions: readonly ToolQuestion[];
  readonly scoresSchema: z.ZodType;
  readonly contentSchema: z.ZodType;
  readonly toView: (input: { readonly scores: unknown; readonly content: unknown; readonly answers: Answers }) => readonly ReportBlock[];
};

type ToolModule = ToolReader & {
  readonly id: string;                                       // stored as tool_run.tool_id, never changes
  readonly version: string;                                  // stored as tool_run.tool_version
  readonly name: string;                                     // shown to clients
  readonly summary: string;                                  // one line for clients
  readonly whenToUse: string;                                // one sentence for the model (#6 routing)
  readonly creditPrice: number;                              // positive integer credits (spec 0004)
  readonly score: (answers: Answers) => Result<unknown, ScoreError>;
  readonly phases: readonly ReportPhase[];                   // at least one
  readonly readers?: Readonly<Record<string, ToolReader>>;   // frozen older versions
};

type ScoreError = { readonly code: "incomplete"; readonly missing: readonly string[] };
```

`defineTool<S, C>(…)` takes a typed module (scores type `S`, content type `C`) and returns the erased `ToolModule`, so each tool is fully typed inside its folder and the registry holds one uniform type.

### Report blocks (the view model)

`ReportBlock` is a discriminated union in `_contract.ts`, drawn by one renderer, `src/components/report/report-view.tsx`, from the existing report parts. The first set covers Stellar and Beacon:

| Block `kind` | Fields | Drawn with |
|---|---|---|
| `score_header` | `title`, `score`, `max`, `verdict` (`good` \| `caution` \| `risk`), `summary` | `score-header`, `verdict-badge` |
| `category_bars` | `title`, `items: CategoryBarItem[]` | `category-bars` |
| `advice_list` | `title`, `items: AdviceItem[]` | `advice-list` |
| `text` | `title`, `paragraphs: string[]` | `report-section` |
| `bullets` | `title`, `items: string[]` | `report-section` |
| `timeline` | `title`, `steps: { label, items: string[] }[]` | `report-section` (new small part) |
| `resources` | `title`, `items: { title, description, url: string \| null }[]` | `report-section` (new small part) |

Luna adds its block kinds when #12 lands. The renderer's `switch` is exhaustive (a `never` check), so a new kind cannot be forgotten. `CategoryBarItem`, `AdviceItem` and `Verdict` move into `_contract.ts`, and `components/report/types.ts` re-exports them.

### Folder layout

```
src/tools/
  _contract.ts        types above, plus defineTool
  _kit/               shared pure helpers (not a tool): answer-schema.ts (parseAnswer), flow.ts (visibleQuestions, nextQuestion, progress), readers.ts
  registry.ts         export const tools = [stellar] as const; getTool, getReader, toolIds
  stellar/
    index.ts          defineTool({ id: "stellar", version: "1", creditPrice: 30, ... })
    questions.ts      11 questions (10 plus commitment_detail)
    scoring.ts        ported calculateScore and calculateDimensionScores
    report.ts         one phase "analysis" (the original AI output schema, as Zod)
    view.ts           toView
    parity.test.ts    the 75 fixture cases
  contract.test.ts    AC-1 invariants over every registered module
  test-tools/         test only fixtures (a 3 phase tool, a two module folder); never registered in production
```

A folder that serves two products (Beacon and Beacon Pro) exports two modules from `index.ts` that share `questions.ts` and `scoring.ts`, and differ in `id`, `creditPrice`, `phases` and `toView`. Both go in the registry list.

### Stellar question ids (stored, never renamed)

| Original | id | Original | id |
|---|---|---|---|
| 1 | `foundation` | 6 | `speed` |
| 2 | `value_creation` | 7 | `passion_market_fit` |
| 3 | `market_validation` | 8 | `competitors` |
| 4 | `investment` | 9 | `learning` |
| 5 | `skills` | 10 | `commitment` |
| 10 follow up | `commitment_detail` (text, `when` commitment is `yes` or `no`) | | |

The parity test maps fixture `questionId` N (and `followUpAnswer`) to these ids.

### Report runner (`src/assistant/report-runner.ts`)

`runReport(deps, { runId, attempt })`, where `deps` injects `model(role)`, `now`, `checkSpendCap`, `recordUsage` and the query functions, so tests pass the AI SDK mock model. The whole body sits in a top level `try`/`catch`: anything unexpected calls `markFailed` with kind `unknown` (AC-9). Steps:

1. Owner: `runs.ownerOf(runId)`, not the session captured by the request, because a guest can link an account while the report generates (`src/db/AGENTS.md`). Then `runs.get(owner, runId)` gives the tool id, version, answer rows and scores. The route already refused a non current version, so here a mismatch is only a race with a deploy, and it fails with `unknown`.
2. Answers: `toAnswers(tool, rows)` (pure, `_kit`) parses each stored value and keeps visible questions. An unparseable value fails the attempt with kind `unknown` and logs `report_stored_data_invalid`.
3. Before each phase, the runner rechecks that its attempt is still current (the `reports.status` row's `attempts` equals `attempt` and status is `generating`). If not, it stops quietly, so an overlapped runner after a stale reclaim spends nothing more.
4. For each phase in order: if `content[phase.key]` exists and parses with `phase.output`, skip it; if it exists but fails to parse, run it again. Otherwise call `checkSpendCap(owner)`, then `generateText` with `output: Output.object({ schema: phase.output })`, `instructions` (AI SDK 7, not `system`), `maxOutputTokens`, and `abortSignal: AbortSignal.timeout(phase.timeoutMs)`. On a schema failure, make one repair call with the Zod issues appended. Record usage for every call that returned usage (a duplicate `callKey` is a no op). Save with `reports.savePhase`.
5. Merge the saved phase outputs, parse with `contentSchema`, then `reports.markReady(runId, attempt, content, modelId)`. `no_credit_hold` from `markReady` is final: the report is already failed with that kind, and the runner just logs it.
6. Any failure calls `reports.markFailed(runId, attempt, { kind, message })`. A `stale_attempt` from any write stops the runner quietly (a newer attempt owns the report).

Timing rules, checked by the contract test: each `phase.timeoutMs` is at most 240000 (4 minutes, well under the 10 minute stale window). The sum over phases of `2 × timeoutMs` (call plus repair) is at most 780000, so the run fits inside `maxDuration` 800.

Usage mapping: `UsageInput` gets `inputTokens`, `outputTokens`, and the cache read and cache write token counts from the AI SDK 7 `usage` object (use the field names from the bundled docs in `node_modules/ai/docs/`). Cost comes from `ai-cost.ts`. Every model id in `models.ts` must have a price there, and a unit test fails if one is missing.

Answers go into prompts inside a clearly fenced data block, and the instructions say to treat the block as client data, never as instructions.

**Data model sketch**: no migration. Uses spec 0002 tables as they are:
- `report.content` (jsonb, nullable) holds the partial phase outputs `{ [phaseKey]: output }` while `generating` or `failed`, and the full validated content once `ready`. The existing CHECK constrains only `ready`.
- `tool_run.tool_id`, `tool_run.tool_version`, `tool_run.scores` and `tool_run_answer.question_id` / `value` hold values defined by the module.
- New query `reports.savePhase(runId, attempt, key, output)`: server only, one statement, `UPDATE report SET content = coalesce(content, '{}'::jsonb) || jsonb_build_object($key, $output::jsonb), updated_at = now() WHERE run_id = $run AND status = 'generating' AND attempts = $attempt`, with `$output` bound as `JSON.stringify(output)` like the other report queries. The runner only passes keys from the phase list. Zero rows means `stale_attempt`. Bumping `updated_at` keeps a long Luna run from looking stale.
- New query `reports.status(userId, runId)`: one statement, owner scoped through `tool_run.user_id`. Returns `tool_id`, `tool_version`, report `status`, `attempts`, `updated_at`, `error`, the saved phase keys (`jsonb_object_keys(content)`, never the content itself), and `has_hold` (an active run hold exists). `not_found` for another user's run, an unknown run, or a run with no report row.
- New query `reports.failStale(userId, runId)`: one statement composed with `releaseRunHoldCtes` (spec 0004). It marks the report failed with kind `timeout` only when `status = 'generating'`, `attempts >= 3`, `updated_at` is older than `STALE_AFTER_MINUTES`, and the run belongs to `userId`, and it releases the hold in the same statement. Zero rows changes nothing.
- Hidden answers stay stored. `runs.startFrom` copies them too, which is harmless because scoring and prompts only read visible answers.

**State transitions** (report, unchanged from spec 0002, driven by the runner):
`pending → generating` (claim, needs a hold) · `generating → generating` (savePhase, same attempt) · `generating → ready` (markReady, charges) · `generating → failed` (markFailed; the third failure releases the hold) · `failed → generating` (Retry, new attempt, saved phases kept) · stale `generating → generating` (reclaim after 10 minutes).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/runs/[runId]/report` | POST | `runId` (path, uuid) | `202` status payload (claimed or already generating); `200` when ready | session (guest or account), run owner | `404` (unknown, not owned, or not completed); `409` `{ code: "version_changed" \| "attempts_exhausted" \| "no_credit_hold" }` with the status payload; `400` bad uuid |
| `/api/runs/[runId]/report` | GET | `runId` (path, uuid) | `{ status, phases: {label, done}[], error?: {kind, title, message}, canRetry, stale, view? }` | session, run owner | `404`; `200` with `error.kind = "stored_data_invalid"` or `"version_changed"` (created at read time) |

POST flow: `reports.status` (version check and 404), then `reports.claim`. On `already_generating` with `stale` and `attempts >= 3`, call `reports.failStale` (AC-15). On `already_generating` or `already_ready`, build the payload from the status row already read. That's two round trips at most, and only on POST.

`buildStatus(statusRow, reader)` (pure, `src/assistant/report-status.ts`): `phases` come from the current module's phases when the version is current. For an old version, `phases` is empty: a ready old report shows its view, and a non ready one shows `version_changed`. `canRetry` is `status = failed && attempts < 3 && has_hold && version current`, or `stale && attempts < 3`. A ready report whose stored data fails to parse returns `status: "ready"`, `error.kind: "stored_data_invalid"`, and no `view`.

Error copy: `error-copy.ts` gains one entry per report error kind: `timeout`, `provider_overloaded`, `invalid_output`, `unknown` (all "That did not work, your answers are safe", Retry); `spend_cap` (the existing entry); `no_credit_hold` ("The credits for this run were returned. Start again to try", no Retry); `version_changed` ("This tool was updated. Start again with your answers", no Retry); `stored_data_invalid` ("We could not open this report", no Retry); plus `exhausted` ("We could not make this report. Your credits were returned", no Retry), used when `status = failed` and `attempts >= 3`.
| `tools/registry.ts` | functions | `getTool(id)`, `getReader(id, version)`, `toolIds` | module or reader | server and client safe (pure) | `unknown_tool`, `unsupported_version` |
| `tools/_kit` | functions | `parseAnswer`, `visibleQuestions`, `nextQuestion`, `progress` | typed results | pure | `invalid_answer`, `unknown_question` |

The POST route sets `export const maxDuration = 800` (Vercel Pro limit, so the five Luna phases fit). Both routes validate `runId` with Zod and return typed JSON, never a thrown 500.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| startRun (#6, spec 0004) | price | `getTool(toolId).creditPrice` |
| runs.start | `toolId`, `toolVersion` | module `id`, `version` |
| runs.saveAnswer | validated value | `parseAnswer` over the module's question |
| runs.complete | scores | `module.score(visible answers from runs.get)` |
| runner, each phase | prompt inputs | visible answers and scores from `runs.get`; earlier outputs from `report.content` |
| runner | model id | `src/assistant/models.ts` role `report` (created here; sets the Claude model for reports) |
| runner | usage cost | `src/lib/ai-cost.ts` over the AI SDK `usage` (built here if #21 has not built it yet, as spec 0004 also allows) |
| runner | usage `callKey` | `report:<runId>:<attempt>:<phaseKey>:<try>` (`try` is 1, or 2 for the repair call) |
| runner | `attempt` | the claimed report row's `attempts` |
| GET | `phases[].done` | phase key present in `report.content` |
| GET | `phases[].label`, total | the reader for the run's `tool_version` (phases come from the current module; old versions show `ready` only) |
| runs.complete (#7 calls it) | `scores`, `answerCount`, `lastAnswerAt` | `scoreRun(tool, runs.get answer rows)` (AC-16) |
| runner | run owner | `runs.ownerOf(runId)` inside `after()` |
| Stellar `toView` | `score_header` score, max, verdict | ported `score` out of `max` 100; level green → `good`, yellow → `caution`, red → `risk` |
| parity test | expected differences | `fixtures/parity/README.md`, "Known differences on purpose" 1 and 2 |
| GET | `canRetry` | `buildStatus` rule above, from `reports.status` (`attempts`, `has_hold`, `updated_at`, version) |
| GET | `stale` | `status = generating` and `updated_at` older than `STALE_AFTER_MINUTES` (spec 0002, 10) |
| GET | error message | `components/feedback/error-copy.ts` keyed by `ReportError.kind` (the stored message is never shown raw) |
| GET | `view` | `reader.toView({ scores, content, answers })` after parsing each with the reader's schemas |
| panel | poll interval | constants in the panel: 2s, rising to 5s after 30s; stops when ready or failed |

**Key invariants**:
- Tool modules are pure and side effect free. `score` and `toView` are deterministic.
- A tool id and its stored question ids never change once shipped. A breaking change bumps `version` and freezes the old read side in `readers`.
- No report is ready without a charge, and no generation starts without a hold (spec 0004; enforced by the existing SQL).
- At most one runner works on a report at a time (the claim CAS). Every write is fenced by `attempt`.
- Only the runner calls AI for reports, and every call is recorded in `ai_usage`.

**Security model**:
- Both routes need a session (guest or account) and act only on runs the user owns. Ownership comes from the query layer's `userId` filter, and other users get a bare `404`.
- The client never sends a price, a tool id, answers or content to these routes. All of it is read on the server.
- Prompt injection: free text answers go into a fenced data block. The output is forced through a Zod schema, and the renderer shows text only (no HTML). Links in a `resources` block are shown only when they are `https:` URLs, with `rel="noopener noreferrer nofollow"` and `target="_blank"`.
- Data protection (NDPA 2023, GDPR, as spec 0002): answers go to Anthropic as the AI processor, already covered by spec 0001. Logs carry ids, phase keys and error kinds, never answers or content.
- Spend: the claim CAS plus the three attempt cap bounds AI calls per run to about `3 × phases × 2`. A runner overlapped by a stale reclaim can add at most the one call already in flight, because it rechecks its attempt before each phase. `checkSpendCap(userId)` is the global guard.

**Observability**: structured log events `report_claimed`, `report_phase_done` (`runId`, `phaseKey`, `ms`, tokens), `report_phase_repair`, `report_failed` (`kind`), `report_ready`, plus the existing `credit_run_charged`.

**Configuration required**:
- `ANTHROPIC_API_KEY`: Claude access for the report runner (read through `src/lib/env.ts`, listed in `.env.example`).

**Critical test scenarios**:
- Contract: every registered module passes the invariants; a broken test tool (duplicate question id, price 0, phase key missing from contentSchema) fails, verifies **AC-1**, **AC-14**
- Registry: unknown id and unknown version return typed errors, verifies **AC-2**
- Answers: each card kind accepts its range and rejects outside it; refine reasons surface, verifies **AC-3**
- Flow: the Stellar follow up appears only for yes or no; progress counts visible questions; a hidden answer is ignored, verifies **AC-4**
- Parity: all 75 Stellar cases match, verifies **AC-5**
- Scoring: a missing answer returns `incomplete` with the ids; Luna style empty scores, verifies **AC-6**
- Happy path (integration, mock model): complete a funded Stellar run, POST returns 202, the runner saves the phase, marks ready, and charges 30; GET returns `ready` with blocks, verifies **AC-7**, **AC-8**, **AC-10**
- Concurrency: two POSTs at once give one claim and one set of AI calls, verifies **AC-7**
- Resume: the 3 phase test tool fails at phase 2; the retry skips phase 1 (mock call count) and phase 2 sees phase 1's output, verifies **AC-8**
- Bad output: invalid then valid gives ready with 2 usage rows; invalid twice gives `invalid_output`; the third failed attempt releases the hold, verifies **AC-9**, **AC-12**
- Spend cap: the hook refuses, no model call, `spend_cap`, verifies **AC-12**
- Auth: another user's POST and GET get 404 and nothing changes, verifies **AC-10**
- Old version: a run stored as version `0` with a test reader renders; an unknown version gives `unsupported_version`; corrupt content gives `stored_data_invalid`, verifies **AC-13**
- Stale last attempt: a report `generating` for 11 minutes with `attempts` 3; POST fails it as `timeout` and releases the hold; GET shows exhausted, verifies **AC-15**
- Version changed: a funded run stored with an old version; POST returns `409 version_changed`, and `attempts` and the hold are unchanged, verifies **AC-7**
- Overlap: the runner's attempt is reclaimed between phases; the old runner stops before its next phase (mock call count), verifies **AC-7**, **AC-12**
- Crash: the mock model throws a non provider error; the report ends `failed` with `unknown`, never stuck `generating`, verifies **AC-9**
- scoreRun: hidden answers are ignored in scores but counted in `answerCount`; a corrupt stored value gives `stored_data_invalid`, verifies **AC-16**
- Panel (Playwright on `/design` fixtures plus axe): the generating, failed with retry, exhausted and ready states, verifies **AC-11**

## Build plan

Tracer Bullet: get the thinnest real path working (Stellar scored, generated with a mock model, shown in the panel), then thicken it.

1. Contract and kit: `_contract.ts` (move `QuestionView`, `AnswerValue` and the report item types in, re-export from components), `defineTool`, `_kit/` (`parseAnswer`, flow helpers, `toAnswers`, `scoreRun`), `registry.ts`, and the ESLint import boundary rule, with unit tests, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-14**, **AC-16**
2. Stellar pure port: questions with ids, scoring, scores schema, and the parity test over all 75 cases, satisfies **AC-5**, **AC-6**
3. Install AI SDK 7 (`ai`, `@ai-sdk/anthropic`); read `node_modules/ai/docs/` for `generateText`, `Output.object`, usage fields and the test mock model. Add `ANTHROPIC_API_KEY` to `env.ts` and `.env.example`; `assistant/models.ts` (role `report`); `lib/ai-cost.ts` if absent (with the every model has a price test); `lib/spend-cap.ts` with `checkSpendCap(userId)` that allows everything until the abuse feature fills it in, satisfies **AC-12**, **AC-14**
4. Queries `reports.savePhase`, `reports.status` and `reports.failStale` with integration tests (CAS on attempt, merge, stale attempt, owner scoping, failStale releases the hold only when stale and exhausted), satisfies **AC-8**, **AC-10**, **AC-15**
5. Stellar report phase and `contentSchema` (from `ai-output-schema.json`), then the runner with the mock model: owner lookup, phases, resume with revalidation, repair, error mapping, top level catch, attempt recheck, usage, spend cap, stale attempt, satisfies **AC-8**, **AC-9**, **AC-12**
6. Routes: first read `node_modules/next/dist/docs/` for route handlers, `after()` and `maxDuration` under Cache Components, and confirm both work in a route handler here. Then POST (version check, claim, failStale, `after()`, `maxDuration`) and GET (`reports.status`, `buildStatus`, readers, `stored_data_invalid`), with integration tests through the runner with the mock model, including concurrency, overlap and ownership, satisfies **AC-7**, **AC-10**, **AC-13**, **AC-15**
7. Report blocks and renderer: Stellar `toView`, `report-view.tsx` with the exhaustive switch, the safe link rule, satisfies **AC-11**, **AC-13**
8. Panel states and polling in `report-panel.tsx`, error copy for each kind (including `exhausted`, `version_changed`, `stored_data_invalid`, `no_credit_hold`), `/design` fixtures for all four states, Playwright and axe, satisfies **AC-11**
9. Contract test over the registry (including the phase timing rules) plus `test-tools/` (3 phase tool, two module folder, old version reader), satisfies **AC-1**, **AC-8**, **AC-13**

## Consequences

**Positive**:
- Adding Beacon, Beacon Pro and Luna is folder work only. Retries, saving, charging, usage, progress and errors are written once.
- Tools are fully unit testable with no mocks. Parity tests run in milliseconds.
- The PDF (#15) can reuse the same blocks.
- Old reports stay readable after a tool changes.

**Negative / tradeoffs**:
- The block set limits what a report can look like. Luna's rich plan will need several new block kinds and renderer parts.
- Polling costs a light DB read every 2 to 5 seconds per open panel while generating.
- `after()` is not durable. A crash or redeploy mid run leaves the report `generating` until the 10 minute stale window lets the client retry (saved phases are kept, so little is lost).
- A breaking tool change means freezing the old read side in `readers`, which keeps old code alive.
- Moving `QuestionView` and the report item types into `tools/` touches existing component imports.

**Neutral**:
- `src/assistant/` gains its first files (`models.ts`, `report-runner.ts`) before the assistant brain (#6).
- `report.content` holds partial content while generating. Readers must treat only `ready` content as complete.

## Follow-up

- [ ] Beacon port (#10 or its feature): decide whether Beacon's contact questions (`fullName`, `email`, `businessName`) are dropped in favour of the account and profile, and set the `factKey`s.
- [ ] Luna (#12): add its block kinds and renderer parts, and confirm the five phases fit in `maxDuration` 800 with real timings. If not, move the runner to a durable workflow (the route and contract stay the same).
- [ ] #6 must build the `startRun` tool's `toolId` enum and descriptions from `toolIds`, `name` and `whenToUse`, and read prices from `creditPrice` (spec 0004's approval gated `startRun` / `resumeRun`).
- [ ] The abuse limits feature fills in `checkSpendCap()` with the Upstash daily cap (spec 0001).
- [ ] Update spec 0004's value sourcing row "until then the Stellar module constant 30" once this ships (`/sync`).
