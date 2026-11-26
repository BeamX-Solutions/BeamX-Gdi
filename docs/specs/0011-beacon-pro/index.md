# 0011. Beacon Pro in chat

**Date**: 2026-11-26
**Status**: In Progress

## Summary

Beacon Pro becomes the third tool in the workspace. It uses the same 23 questions and the same scores as Beacon, but Claude writes a full personal advisory of 900 to 1200 words, in five fixed sections, instead of polishing rule based advice. A client who already answered Beacon (or Pro) gets Pro without answering again: the approval card names the earlier answers it will use. The score and category bars show the moment the report starts, and the advisory appears when Claude finishes, so the panel feels live without true word by word streaming.

## Requirements

**User stories**:
- As a business owner who just read my Beacon report, I want a deeper, personal advisory without answering the same 23 questions again.
- As a business owner new to BeamX, I want to run Pro directly and answer the questions once.
- As a business owner waiting for my Pro report, I want to see my score straight away instead of a blank skeleton.
- As BeamX, I want the assistant to offer Pro when a client wants more depth, without pushing it.

**Acceptance criteria**:
- **AC-1**: The registry lists a second module from `src/tools/beacon/index.ts`: id `beacon_pro`, version `1`, name `Beacon Pro`, 150 credits, the same `questions`, `scoresSchema` and `score` as Beacon (imported, never copied). Beacon's module and its stored reports are unchanged.
- **AC-2**: `beaconPro.score` gives the same scores as Beacon for every Beacon parity fixture (the standalone Beacon Pro uses identical scoring), checked by a parity test.
- **AC-3**: A tool module may declare `reuseFrom` (tool ids whose answers it accepts). Beacon Pro declares `["beacon", "beacon_pro"]`. Before the approval card, the server picks a reuse source for the client: first an `in_progress` run of a `reuseFrom` tool in this chat (the half done case), else the latest `completed` run of a `reuseFrom` tool owned by the client, from any chat, of any age. A run whose report failed still counts. No source means a normal run.
- **AC-4**: When a source exists, the approval card shows the price (150) and one line naming it: "Uses your Beacon answers from 24 Nov" (the source tool's name, and the date of its last answer in Africa/Lagos). The model never writes these values; the server fills them, like `shownPrice`.
- **AC-5**: If the client asked to answer again ("start fresh", "my business changed"), the assistant calls `startRun` with `freshAnswers: true`; no source is looked up and the card shows no reuse line.
- **AC-6**: On approval with a source, one batch holds 150 credits, creates the Pro run in this chat with `based_on_run_id` set to the source, and copies the source's answers keeping each `source`. Each copied answer is checked again with Pro's own answer schema; one that fails is left out and asked as a card. When the source was an `in_progress` run in this chat, that run is abandoned and its credit hold released in the same batch, so the client never pays twice for one set of answers.
- **AC-7**: A Pro run whose copied answers are complete is scored and completed straight away, and the chat shows the view report card with no question cards. A run with missing answers asks only those, then completes as usual.
- **AC-8**: If the source run is gone or no longer qualifies at approval time (deleted, not owned, or another tab changed it), the run starts fresh at the same price and asks all questions, and the tool result says `freshStart: true`, so the assistant can tell the client.
- **AC-9**: Pro has one report phase, `advisory`, labelled "Writing your advisory". Claude returns five sections as structured parts: `executive_summary`, `critical_priorities` (present exactly when the scores have critical flags, else null), `strategic_recommendations`, `growth_opportunities` (present exactly when there are opportunity flags, else null), `next_steps`. Each section is a non empty list of rich parts (`paragraph`, `subheading`, `label`, `note`, `bullets`, `numbered`); no links.
- **AC-10**: The phase `check` rejects (one repair call, then the normal failure path) an output that: has a conditional section present or missing against the flags, contains an em dash or en dash, contains a URL, or has a total word count outside 700 to 1600.
- **AC-11**: The prompt carries the client's first name when known (spec 0010 `PhaseClient`), and otherwise addresses them as "you". It carries the business name, industry, years in business, primary pain point, every category score with its grade and answers, and both flag lists, inside the fenced data block (`DATA_BLOCK_RULE`). The instructions are ported from the standalone's system prompt (voice, Nigerian context, section rules, a 30 day plan per critical flag, a 90 day plan for the weakest one or two categories, a clear 30 day focus and a BeamX consultation close).
- **AC-12**: The ready Pro report shows, in order: a score header (`Beacon Pro`, total of 100, the band verdict and line), the five category bars, a "Critical flags" bullet list and an "Opportunities" bullet list (each only when not empty), then one `rich_section` per present advisory section, with the standalone headings ("Executive Summary", "Critical Priorities (Next 30 Days)", "Strategic Recommendations", "Growth Opportunities", "Your Next Steps"). Beacon's rule based 90 day plan is not shown.
- **AC-13**: A tool module may declare `toPreview(scores)`, a pure function returning report blocks. While a report is `pending`, `generating` or `failed`, `GET` and `POST /api/runs/[runId]/report` include `preview` (those blocks) when the current module has `toPreview` and the stored scores parse. The panel draws the preview above the skeleton (or above the error card). Pro's preview is exactly the first blocks of its ready view (header, bars, flag lists), so nothing jumps when the advisory lands. Stellar and Beacon have no preview and look as they do today.
- **AC-14**: The assistant's `whenToUse` and instructions make it: propose Pro when the client asks for more depth, a deeper plan or a personal advisory; mention Pro once, with no price in its own words, after a Beacon report is ready, and not again in that chat; explain, when asked, that Pro uses the same questions and scores and adds a full advisory written for them. The assistant eval gains cases for these and its results file is committed.
- **AC-15**: Failure, retry and refund behave as for every tool (spec 0005, AC-11; spec 0004, AC-5): a failed advisory shows the retry card, the third failure returns the 150 credits.
- **AC-16**: In chat, a client who finished Beacon says "I want something deeper", approves the Pro card showing the reuse line, sees the score at once and the full advisory within the panel; a refresh keeps it. A Playwright test covers this with the scripted fake model, and one real model run is recorded in `verify.md`.

## Decision

**Chosen option**: Option 2, a second Beacon module with server side answer reuse and a score preview.

Pro is a module beside Beacon in `src/tools/beacon/`, sharing its questions and scoring; answers are reused through a new `reuseFrom` field read by `startRun`, and the "live" feel comes from a new optional `toPreview` that shows the scores while the advisory is written.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change, so no migration.
- `tool_run`: a Pro run is a normal row with `tool_id = 'beacon_pro'`, `tool_version = '1'`, and `based_on_run_id` pointing at the reuse source (null for a fresh run). The column and its index exist from spec 0002.
- `tool_run_answer`: copied rows keep their `source` (`client`, `profile`, ...). Unique `(run_id, question_id)` as today.
- `report`: one row per Pro run, `content = { advisory: { executive_summary, critical_priorities, strategic_recommendations, growth_opportunities, next_steps } }`.
- `credit_hold` / ledger: a 150 credit hold per Pro run through `queries/credits.ts`; the abandoned half done source run's hold is released in the same batch (AC-6).

**State transitions**:
- Pro run with a complete source: (none) → `in_progress` (created with answers) → `completed` (same turn, AC-7). Report: `pending` → `generating` → `ready` | `failed` (up to 3 attempts).
- Half done Beacon source in this chat: `in_progress` → `abandoned`, hold released (AC-6).
- Completed source runs are never changed.

**API surface** (no new route; changes to existing surfaces):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `startRun` assistant tool | AI SDK tool, needs approval | `toolId` (model), `freshAnswers?: boolean` (model), `shownPrice`, `availableBalance`, `reuse?: { runId, toolName, answeredOn }` (server fields) | `{ ok, runId, toolName, freshStart }` | chat session owner | `price_changed`, `reuse_changed`, `insufficient_credits`, `run_in_progress`, guest guards |
| `runs.startFromOther` | DB query | `userId`, `conversationId`, `sourceRunId`, `toolId`, `toolVersion`, `answers` (already checked) | `{ run, abandonedRunId }` | filters by `userId` | `not_found` (source gone or not owned), `run_in_progress` |
| `runs.reuseSource` | DB query | `userId`, `conversationId`, `toolIds` | `{ runId, toolId, status, lastAnswerAt } \| null` | filters by `userId` | none (null when nothing) |
| `GET/POST /api/runs/[runId]/report` | route (existing) | `runId` | adds `preview?: ReportBlock[]` | run owner only | unchanged (404 for others) |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| startRun refine | reuse source run | `runs.reuseSource`: active run in `conversationId` with `tool_id` in `reuseFrom` and `status = 'in_progress'`, else latest `status = 'completed'` run of the user with `tool_id` in `reuseFrom`, ordered by `completed_at desc` |
| startRun refine | "Beacon" in the reuse line | registry `name` of the source run's `tool_id` |
| startRun refine | "24 Nov" | max `tool_run_answer.updated_at` of the source run, formatted in `billingConfig.chat.dayTimeZone` (Africa/Lagos) |
| startRun refine | price 150 | `beaconPro.creditPrice` |
| startRun execute | whether to reuse | `freshAnswers` input false or absent AND `reuse` server field present AND it still matches `runs.reuseSource` (else `reuse_changed`, the model calls again for a fresh card) |
| startRun execute | copied answers | source `tool_run_answer` rows, each parsed by `parseAnswer` against `beaconPro.questions`; failures dropped |
| completion | scores | `beaconPro.score(answers)` (the shared `scoreBeacon`) |
| advisory prompt | first name | `PhaseClient.firstName` (spec 0010) |
| advisory prompt | business name, industry, years, pain point, category answers | the run's answers by question id (`business_name`, `industry`, `years_in_business`, `primary_pain_point`, and each category's questions), labelled with `formatAnswer` |
| advisory prompt | category scores, grades, percentages, band, flags | the run's parsed `scores` |
| check | which conditional sections must exist | `scores.flags.critical.length > 0`, `scores.flags.opportunities.length > 0` |
| preview | header, bars, flag lists | `beaconPro.toPreview(scores)`, scores read in the same `reports.status` query (`t.scores` added to its select) |
| ready view | advisory sections | `report.content.advisory` |
| Pro suggestion once | "already suggested in this chat" | the model's own chat history (instruction rule, checked by the eval), no stored flag |

**Key invariants**:
- `questions.ts`, `scoring.ts`, `categories.ts` and `advisory.ts` are shared and never forked (spec 0010).
- A Pro run's answers belong to the same user as its source (every query filters by `userId`).
- At most one `in_progress` run per chat (the existing partial unique index); `startFromOther` abandons the half done source in the same batch it inserts the Pro run.
- One set of answers never carries two live holds: the abandoned source's hold is released in the batch that takes Pro's hold.
- `toPreview(scores)` deep equals the first blocks of `toView` for the same scores (a unit test holds it).
- The model never sets `shownPrice`, `availableBalance` or `reuse`.

**Security model**: same as every tool. Only the run's owner reads its report, preview included (404 otherwise). The reuse lookup and copy filter by the session's `userId` (after a guest link, the linked owner, through `asOwner`). Guests may run Pro behind the existing spend cap and daily run limits. No new personal data: business answers are already stored.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: finished Beacon in chat A, Pro asked in chat B, card shows "Uses your Beacon answers from ...", approve, no cards, report ready with header, bars, flags and five or three sections, verifies **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-12**, **AC-16**
- Half done: 10 Beacon answers in this chat, ask for Pro, approve, Beacon run abandoned with its hold released, Pro asks only the remaining 13, verifies **AC-3**, **AC-6**, **AC-7**
- Fresh: "answer again" gives no reuse line and all 23 cards, verifies **AC-5**
- Source vanishes: the source is deleted between card and approval, the run starts fresh with `freshStart: true`, verifies **AC-8**
- Check: missing critical section when flags exist, an em dash, a URL, 400 words: each causes a repair, verifies **AC-10**
- Preview: generating Pro report returns `preview`; a Stellar report never does; preview equals the head of the ready view, verifies **AC-13**
- Failure: three failed attempts return 150 credits, verifies **AC-15**
- Auth: another user's run id returns 404 with no preview, and `reuseSource` never returns another user's run, verifies **AC-3**, **AC-13**
- Parity: every Beacon fixture scores the same through `beaconPro.score`, verifies **AC-2**

## Build plan

Tracer Bullet: a thin Pro thread end to end first (fresh run, report, view), then thicken with reuse, preview and the assistant.

1. Pro module skeleton: `src/tools/beacon/pro.ts` (`beaconPro` export in `index.ts`), the advisory content schema, the ported prompt, the check, the view, registry line, scoring parity test, satisfies **AC-1**, **AC-2**, **AC-9**, **AC-10**, **AC-11**, **AC-12**
2. Contract additions: `reuseFrom?` and `toPreview?` on the module types and `defineTool`, with the contract check (preview equals the head of the view), satisfies **AC-3**, **AC-13**
3. Preview in the status path: `reports.status` selects `t.scores`, `buildStatus` adds `preview`, the payload schema and the panel draw it above the skeleton and the error card, `/design` fixture with axe, satisfies **AC-13**
4. Reuse queries: `runs.reuseSource` and `runs.startFromOther` (with the hold, the abandon and the hold release in one batch), integration tests, satisfies **AC-3**, **AC-6**, **AC-8**
5. `startRun` changes: `freshAnswers`, the `reuse` server field in `refineStartRun`, the reuse line on the approval card, execute through `startFromOther` with the fresh fallback, and completion right after start when no question is left, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**
6. Assistant: `whenToUse`, the instructions for depth, the one time mention and the difference, eval cases, run `pnpm eval:assistant` and commit its results, satisfies **AC-14**
7. End to end: Playwright flow with the scripted fake model (Beacon, then Pro with reuse), a failure path check, and one real model run recorded, satisfies **AC-15**, **AC-16**

## Consequences

**Positive**:
- Pro is mostly folder work; the runner, retries, charging and panel are reused.
- `reuseFrom` and `toPreview` are generic, so Luna (#12) and the business profile (#9) can use them.
- No migration.

**Negative / tradeoffs**:
- The advisory does not type out word by word like the standalone; the client waits about 30 to 60 seconds for it, with the score already visible.
- Answers of any age are reused; a client whose business changed must say so (the card's reuse line is the prompt to do it).
- Every status poll now reads `t.scores` (a small jsonb on the same row), slightly more bytes per poll.
- Opus at medium effort writes the advisory, which costs more per run than Beacon's polish; the 150 credit price covers it (spec 0004).

**Neutral**:
- `startRun` gains a model input (`freshAnswers`) and a server field (`reuse`), so the assistant eval results change and must be committed.
- The `restartRun` same tool copy stays as it is; cross tool reuse goes only through `startRun`.

## Follow-up

- [ ] When #9 (shared business profile) lands, decide whether profile facts replace or sit beside `reuseFrom` for Beacon family runs.
- [ ] Spec 0010's follow up on `MAX_RUN_MS` (780000) versus the 300 second Hobby limit still stands; Pro's phase timeout (120 seconds, 240 with a repair) fits under 300.
