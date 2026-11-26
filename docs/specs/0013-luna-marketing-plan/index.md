# 0013. Luna marketing plan in chat

**Date**: 2026-11-26
**Status**: Proposed

## Summary

Luna becomes the fourth tool: the client answers its 50 questions as cards in chat (12 about the business, then 38 across 9 marketing areas, called squares), with progress shown by square, and can pause and come back at any time. The plan is then written by Claude in five phases, one phase per server call, because one call on Vercel Hobby lasts at most 300 seconds. After each phase is saved, the report panel asks for the next one, the same way the standalone Luna's browser does; if the client leaves, the plan waits at the last saved phase and continues when they come back. A failed phase retries from where it broke.

> Written while the engineer was away, on their instruction to go with the recommended picks. Every decision below is the recommended option; review it before building.

## Requirements

**User stories**:
- As a business owner, I want to answer Luna's long questionnaire in chat without losing my place, so I can do it in more than one sitting.
- As a business owner, I want my plan to finish even if a step fails or I close the tab, without paying twice.
- As BeamX, I want the plan to match what the standalone Luna produces, section by section.

**Acceptance criteria**:
- **AC-1**: `src/tools/luna/` registers `luna`, version `1`, name `Luna`, 500 credits (spec 0004), with the 50 questions ported from `fixtures/parity/luna/questions.json` in order, ids and option values kept as slugs of the standalone values, and `area` set to "Your business" or the square title.
- **AC-2**: Card mapping: `select` and `radio` become `single`; `multiselect` becomes `multi` with `max` from `maxSelections` (else the option count) and `min` 1; `text` becomes `text` (max 200); `textarea` becomes `text` with `maxLength` 1000. The one optional question (`business-website`) gets a Skip action that stores an empty string; every other question is required.
- **AC-3**: The progress line reads "Your business · Question 4 of 12" for the first 12, then "Square 3 of 9: Media Channels & Reach · Question 2 of 3", using the existing area progress (spec 0005).
- **AC-4**: Pausing works as for every tool (spec 0006): the progress bar's pause, switching tools, or leaving the chat keeps the run and its hold; "continue" resumes at the first unanswered question. Answers already given are never asked again.
- **AC-5**: Luna has no scoring. `score` checks that every required visible answer is present and returns `{ answered: number }`; the report has five phases with the standalone's slices: `analysis` (context only, never shown), `core` (`customerJourney`, `strategicInsights`, `risksPositioning`), `overview` (`executiveSummary`, `implementation`), `operations` (`resources`, `kpis`), `assets` (`templates`, `investmentRoi`). Each phase has a Zod output schema ported from `fixtures/parity/luna/plan-shape.md` and its instructions ported from the standalone `src/lib/claude.ts`; later phases receive earlier outputs through `earlier`.
- **AC-6**: A tool module may set `phasesPerCall: 1`. For such a tool the runner saves one phase per claimed call and then sets the report to the new status `partial` (content keeps the saved phases) instead of continuing. The last phase marks the report `ready` and charges the hold, as today.
- **AC-7**: Claiming a `partial` report starts the next phase without spending an attempt. The claim is a compare and set on `status = 'partial'`, so two tabs that POST at once start the phase once (the other gets `already_generating`). Attempts count failed calls only: a failed phase sets `failed`; Retry claims it again and uses an attempt; three failures release the hold (spec 0004, AC-5). A phase already saved is never run again.
- **AC-8**: The report status payload reports `partial` as `status: "partial"` with the done phases ticked. The panel treats `partial` like `generating` for display, and POSTs the report once for each new partial state it sees (keyed by the count of done phases), so the next phase starts within one poll.
- **AC-9**: If no client is watching, a `partial` report waits. When the client opens the chat again, the view report card or panel POSTs and the plan continues from the next phase. A `partial` report not touched for 10 minutes is not stale; it simply waits.
- **AC-10**: The contract check changes from a whole run budget to a per call budget: for every tool, the phases one call may run (all of them, or one when `phasesPerCall` is 1) must fit `2 × timeoutMs` within 280 seconds (the route's 300 second `maxDuration` minus a margin). Stellar and Beacon are checked under this rule, and Stellar's phase timeout is lowered to fit (spec 0010 follow up).
- **AC-11**: The ready plan shows, in order: an executive summary (text), the customer journey (rich sections per stage), strategic insights (advice list), risks and positioning (rich section), the implementation roadmap (timeline: three phases with their steps), resources (bullets), KPIs (bullets with target values), templates (rich sections), and investment and ROI (rich section with stat lines). Existing block kinds only; the full layout comes with the PDF (#15).
- **AC-12**: Luna's seven business questions link to the profile catalog (spec 0012, AC-12) once #9 is built; until then the existing chat facts prefill applies.
- **AC-13**: In chat, a client who says "I need a marketing plan for my restaurant" gets Luna proposed at 500 credits, answers the cards across two sittings (leaving after square 3 and coming back), and sees the ready plan; a phase failure shows Retry and resumes from that phase. Playwright covers it with the scripted fake model; one real model run is recorded in `verify.md`.
- **AC-14**: Website content: the standalone fetches the client's website and puts its text into the analysis, core and overview prompts. The workspace does not fetch it in this feature (a server side fetch of a client supplied URL is a request forgery risk and adds an untrusted text source to the prompt); the prompts carry the website address only, as "Website: <url or none>". A later feature may add a safe fetch.
- **AC-15**: Luna's phases use a new model role `report_long` (in `assistant/models.ts`: Claude Sonnet 5.5, low effort), matching the standalone's Sonnet class model. Real Opus runs write about 85 output tokens a second, so Luna's 9,000 to 12,000 token phases would take 105 to 140 seconds each, and a repair would not fit one call. Each phase's `maxOutputTokens` and `timeoutMs` must pass the per call budget (AC-10) on this role.

## Decision

**Chosen option**: Option 2, one phase per call with client driven continuation.

The runner stops after each phase for Luna, saving the report as `partial`; the panel's next poll asks for the next phase, so no new infrastructure is needed and a closed tab simply pauses the plan.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (one migration, additive):
- `report_status` enum gains `partial`.
- `report.content` holds the saved phases by key, as today; `report.attempts` keeps its 0 to 3 check, now counting failed calls only.
- No new tables. Luna runs and answers use `tool_run` and `tool_run_answer`; the hold is the usual `credit_hold` (500).

**State transitions** (report):
- `pending` → `generating` (claim, attempt 1) → `partial` (phase saved, more to go) → `generating` (claim, same attempt) → ... → `ready` (last phase, hold charged).
- `generating` → `failed` (phase error) → `generating` (Retry, attempt + 1) → resumes at the first unsaved phase.
- `failed` with attempts = 3 → hold released, final card.
- `partial` never goes stale; `generating` goes stale after 10 minutes, as today.

**API surface** (no new route):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `ToolModule.phasesPerCall` | contract field | `1` or absent | runner behavior | n/a | contract check |
| `reports.claim` | existing query | `runId` | claims `pending`, `failed` (attempt + 1) and `partial` (same attempt) | owner | unchanged |
| `reports.savePartial` | new query | `runId`, `attempt` | `status = 'partial'` guarded by `generating` and the attempt | owner | `stale_attempt` |
| `POST /api/runs/[runId]/report` | route | `runId` | 202 while `generating` or `partial` | owner | unchanged |
| `GET /api/runs/[runId]/report` | route | `runId` | `status` may be `partial` | owner | unchanged |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| questions | ids, text, options, types, max selections, required | `fixtures/parity/luna/questions.json` (standalone at the recorded commit) |
| progress | square number and title | question `area` and the `squares` list in the same fixture |
| phase prompts | instructions and output fields | the standalone `src/lib/claude.ts` and `plan-shape.md` |
| phase token budgets | `maxOutputTokens` | the standalone's `max_tokens` per call (analysis 12000, core and overview their values in `claude.ts`, operations 9000, assets 9000), capped by the runner ceiling |
| website | prompt line | the `business-website` answer only; no fetch (AC-14) |
| model | role | `report_long` (AC-15) |
| phase timeout | `timeoutMs` | 130 seconds per phase, so one call with a repair fits 280 seconds (AC-10) |
| price | 500 | `luna.creditPrice` (spec 0004) |
| next phase trigger | when | the panel's poll seeing `partial` with a new done count |
| attempts | count | failed calls only (AC-7) |
| ready view | blocks | `lunaView(content)`, pure |

**Key invariants**:
- A saved phase is never regenerated; the runner always starts at the first unsaved phase.
- The hold is charged once, when the last phase marks the report ready.
- One call never runs more phases than `phasesPerCall`.
- `analysis` output is stored but never shown.

**Security model**: as every tool: owner only reads; answers go into prompts inside the fenced data block (`DATA_BLOCK_RULE`); the guest guards and spend cap apply at Approve and per phase (the runner checks the cap before each phase, as today).

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: 50 cards, approve, five phases, ready plan, verifies **AC-1**, **AC-5**, **AC-6**, **AC-11**, **AC-13**
- Pause: leave after square 3, reopen, continue at square 4, verifies **AC-4**
- Partial: each POST saves one phase and returns to `partial`; attempts stay 1, verifies **AC-6**, **AC-7**, **AC-8**
- Closed tab: stop polling after phase 2, reopen, phases 3 to 5 run, verifies **AC-9**
- Failure: phase 4 fails, Retry, phases 1 to 3 are not called again, phase 4 runs on attempt 2, verifies **AC-7**
- Budget: a tool whose phases exceed 280 seconds per call fails the contract check, verifies **AC-10**
- Auth: another user's run returns 404, verifies the shared route rules

## Build plan

Tracer Bullet: a thin Luna thread end to end first (all questions, one real phase, partial continuation), then the remaining phases and the plan view.

1. Contract `phasesPerCall` and the per call budget check; lower Stellar's timeout; the `report_long` model role; migration adding `partial`; `reports.claim` and `reports.savePartial`; runner stop after one phase, satisfies **AC-6**, **AC-7**, **AC-10**, **AC-15**
2. Status payload and panel: `partial` shown as generating, one POST per new partial state, reopen continues, satisfies **AC-8**, **AC-9**
3. Luna module: questions with card mapping and Skip for the optional one, progress by square, completeness `score`, registry line, parity test on questions, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
4. The five phases with ported prompts and schemas (website address only), the plan view, `/design` fixture with axe, satisfies **AC-5**, **AC-11**, **AC-14**
5. Profile links (if #9 landed), assistant eval run with Luna registered, Playwright flow with pause and a phase failure, one real model run, satisfies **AC-12**, **AC-13**

## Consequences

**Positive**:
- No queue, cron or self call: continuation rides on the poll that already exists.
- Any future long tool can set `phasesPerCall: 1`.
- Retries never pay for saved work again.

**Negative / tradeoffs**:
- Without the website fetch, plans for clients with a good website lose some detail the standalone had.
- The plan only advances while the client has the chat open; a client who leaves mid generation sees it finish only when they come back.
- Five round trips add a few seconds of overhead compared with one long call.
- The chat plan view is simpler than the standalone's PDF layout until #15.

**Neutral**:
- Spec 0005's AC-7 (whole run in one call) is replaced by the per call budget rule; spec 0005 should be marked as updated by this spec.
- The `report_status` enum gains a value (additive, spec 0002, AC-12).

## Follow-up

- [ ] Update spec 0005's AC-7 note to point here once this is accepted.
- [ ] Revisit server side continuation (for example Vercel Queues) if clients often leave during generation.
