# 0011. Beacon becomes the Claude advisory

**Date**: 2026-11-26
**Status**: In Progress

## Summary

There is one health check tool, Beacon, and it is now the premium one: the client answers the same 23 questions and gets the same scores as before (spec 0010), but Claude writes a full personal advisory of 900 to 1200 words in five fixed sections, ported from the standalone Beacon Pro. The old rule based advisory is scrapped. Beacon costs 150 credits, so prices rise from Stellar (30) to Beacon (150) to Luna (500). The score and category bars show the moment the report starts, and the advisory appears when Claude finishes.

Decided by the engineer on 2026-11-26: "scrap that old beacon and use the beacon pro as beacon", with prices scaling Stellar, Beacon, Luna. An earlier draft of this spec built Beacon Pro as a separate tool beside Beacon; that draft was never shipped.

## Requirements

**User stories**:
- As a business owner, I want a health check that ends in a real, personal plan for my business, not a generic template.
- As a business owner waiting for my report, I want to see my score straight away instead of a blank skeleton.
- As a business owner with an older Beacon report, I want it to still open.

**Acceptance criteria**:
- **AC-1**: The registry lists `beacon`, version `2`, name `Beacon`, 150 credits, with the same 23 questions and scoring as v1 (spec 0010). There is no `beacon_pro` tool.
- **AC-2**: v2 scores are v1's scores without the rule based advisory: total, band, five categories (with their insights) and flags. Scoring still matches every standalone fixture (spec 0010, AC-5).
- **AC-3**: A frozen v1 reader keeps every report made with Beacon v1 readable with its original layout (spec 0005, AC-13). The rule advisory builder and its parity tests are deleted.
- **AC-4**: A v1 run that was in progress when v2 shipped follows the existing version change path (spec 0005, spec 0006): a fresh v2 run, with the old answers offered on the prefill card.
- **AC-5**: Beacon has one report phase, `advisory`, labelled "Writing your advisory". Claude returns five sections as structured parts: `executive_summary`, `critical_priorities` (present exactly when the scores have critical flags, else null), `strategic_recommendations`, `growth_opportunities` (present exactly when there are opportunity flags, else null), `next_steps`. Each section is a non empty list of rich parts (`paragraph`, `subheading`, `label`, `note`, `bullets`, `numbered`); no links.
- **AC-6**: The phase `check` rejects (one repair call, then the normal failure path) an output that has a conditional section present or missing against the flags, contains an em dash or en dash, contains a URL, or has a total word count outside 700 to 1600.
- **AC-7**: The prompt carries the client's first name when known (spec 0010 `PhaseClient`), else "you", plus the business name, industry, years in business, primary pain point, every category score with its grade and answers, and both flag lists as plain labels, inside the fenced data block (`DATA_BLOCK_RULE`). The instructions are ported from the standalone Beacon Pro system prompt (voice, Nigerian context, section rules, a 30 day plan per critical flag, a 90 day plan for the weakest one or two categories, a 30 day focus and a BeamX consultation close).
- **AC-8**: The ready report shows, in order: a score header (`Beacon`, total of 100, the band name, verdict and line), the five category bars, a "Critical flags" and an "Opportunities" bullet list (each only when not empty, plain labels such as "Cash crisis", never codes), then one `rich_section` per present advisory section with the headings "Executive Summary", "Critical Priorities (Next 30 Days)", "Strategic Recommendations", "Growth Opportunities", "Your Next Steps".
- **AC-9**: A tool module may declare `toPreview(scores)`, a pure function returning report blocks. While a report is `pending`, `generating` or `failed`, the report route includes `preview` when the current module has `toPreview` and the stored scores parse. The panel draws it above the skeleton or the error card. Beacon's preview is exactly the first blocks of its ready view, so nothing jumps when the advisory lands. Stellar has no preview.
- **AC-10**: The assistant's `whenToUse` for Beacon covers a plain health check and a request for a personal plan; the assistant eval routes both to Beacon, and its results file is committed.
- **AC-11**: Failure, retry and refund behave as for every tool (spec 0005, AC-11; spec 0004, AC-5): a failed advisory shows the retry card, the third failure returns the 150 credits.
- **AC-12**: In chat, a client says "How healthy is my business?", approves the 150 credit card, answers the 23 cards, sees the score at once and the advisory sections after; a refresh keeps it. Playwright covers it with the scripted fake model, and one real model run is recorded in `verify.md`.

## Decision

**Chosen option**: Beacon v2 is the Pro advisory, with a frozen v1 reader and a score preview.

The `beacon` module moves to version 2 with Claude's advisory phase and view; v1 survives only as a reader; the new optional `toPreview` shows the scores while the advisory is written. This updates spec 0004's price list (Beacon 150, no Beacon Pro) and supersedes spec 0010's report design (its questions and scoring carry over unchanged).

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change, so no migration.
- `tool_run`: new Beacon runs store `tool_version = '2'`; v1 rows keep `'1'` and are read by the v1 reader.
- `tool_run.scores` for v2: `{ total, band, categories, flags }`; v1 rows also carry `advisory`.
- `report.content` for v2: `{ advisory: { executive_summary, critical_priorities, strategic_recommendations, growth_opportunities, next_steps } }`; v1 rows keep `{ advisory: { sections } }`.
- `credit_hold`: 150 per v2 run.

**State transitions**: report `pending` → `generating` → `ready` | `failed` (up to 3 attempts), as every tool.

**API surface** (no new route):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `GET/POST /api/runs/[runId]/report` | route (existing) | `runId` | adds `preview?: ReportBlock[]` while not ready | run owner only | unchanged (404 for others) |
| `reports.status` | DB query (existing) | `userId`, `runId` | adds `scores` (same row) | owner | unchanged |
| `ToolModule.toPreview` | contract field | parsed scores | report blocks | n/a | contract types |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| startRun | price 150 | `beacon.creditPrice` |
| completion | scores | `scoreBeacon(answers)` (spec 0010 port, advisory removed) |
| advisory prompt | first name | `PhaseClient.firstName` |
| advisory prompt | business facts and category answers | the run's answers by question id, labelled with `formatAnswer` |
| advisory prompt and view | flag labels | `flags.ts` `flagLabel(code)` |
| check | which conditional sections must exist | `scores.flags.critical.length > 0`, `scores.flags.opportunities.length > 0` |
| preview | header, bars, flag lists | `beacon.toPreview(scores)` with scores from `reports.status` (`t.scores`) |
| ready view | advisory sections | `report.content.advisory` |
| v1 report view | blocks | `beaconV1Reader.toView` (frozen) |

**Key invariants**:
- `questions.ts` and `scoring.ts` are unchanged in meaning from spec 0010; parity holds.
- `toPreview(scores)` deep equals the first blocks of `toView` for the same scores.
- v1 data is only ever read, never written.

**Security model**: same as every tool: owner only reads; answers enter prompts only inside the fenced data block; guest guards and the spend cap apply.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: 23 cards, approve 150, score preview then advisory, refresh keeps it, verifies **AC-1**, **AC-8**, **AC-9**, **AC-12**
- v1 report: a stored v1 run renders with its old layout, verifies **AC-3**
- Check: missing critical section when flags exist, an em dash, a URL, 400 words: each causes a repair, verifies **AC-6**
- Preview: generating Beacon report returns `preview`; a Stellar report never does; preview equals the head of the ready view, verifies **AC-9**
- Failure: three failed attempts return 150 credits, verifies **AC-11**
- Auth: another user's run id returns 404 with no preview, verifies **AC-9**

## Build plan

1. [x] The advisory phase, check, view and preview (ported from the standalone Pro), flag labels, satisfies **AC-5** to **AC-8**
2. [x] Score preview in the contract, the status query, the route and the panel, `/design` fixtures with axe, satisfies **AC-9**
3. [x] Beacon v2: version bump, 150 credits, scores without the advisory, v1 reader, rule advisory code deleted, satisfies **AC-1** to **AC-4**
4. [x] Assistant `whenToUse`, eval cases and results, satisfies **AC-10**
5. [x] End to end: Playwright with the fake model, one real model run, satisfies **AC-11**, **AC-12**

## Consequences

**Positive**:
- One clear health check product, priced between Stellar and Luna.
- Every client gets a personal advisory, not a template.
- `toPreview` is generic and available to other tools.

**Negative / tradeoffs**:
- Beacon costs three times what it did; the sign up grant was raised to 150 so a new account still gets a first Beacon free.
- Each Beacon run calls Opus for about 1000 words, a higher AI cost per run than the old polish step.
- The advisory does not type out word by word; the client waits about 30 seconds for it, with the score already visible.

**Neutral**:
- Spec 0010 is superseded for the report; its questions and scoring carry over.
- Spec 0004's price list changes (Beacon 150; Beacon Pro removed).

## Follow-up

- [x] Starter credits (30) plus the sign up grant (50) covered only Stellar. Decided 2026-11-26: the sign up grant is now 150, so a first Beacon is covered (spec 0004).
- [ ] Spec 0010's follow up on `MAX_RUN_MS` (780000) versus the 300 second Hobby limit still stands; spec 0013 proposes the per call budget that fixes it.
