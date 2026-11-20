# Verify: Assistant brain · spec 0006 · updated 2026-11-20

_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Milestones 1 and 2 are built (card path and AI turn). The chat route and screen are #7, so until #7 lands, the steps run through tests and a real model harness. The UI steps below apply once `POST /api/chat` renders these parts. Milestone 3 (stop, resume, restart, known facts prefill) has its steps in the section at the end. Evals (milestone 4) add theirs when they land.

## Commands

- [ ] `pnpm test -- src/assistant` → all assistant unit tests pass on the mock model → AC-1, AC-2, AC-3, AC-6, AC-6b, AC-7, AC-8, AC-13, AC-14
- [ ] `pnpm test:integration src/assistant/turn.int.test.ts` on a throwaway Neon branch → a tapped answer saves, the last answer completes and returns `data-report`, a busy lock saves nothing → AC-1, AC-6, AC-7
- [ ] Real model, typed text "I want to sell zobo drinks to offices in Lekki" with no active run → one short reason plus a `startRun` approval request for `stellar` whose input has `shownPrice` equal to Stellar's `creditPrice`; no run is created → AC-3, AC-4, AC-12
- [ ] Approve that card → `credits.startRunWithHold` runs at the registry price, the reply says the run started, and the first `data-question` follows → AC-3
- [ ] Change Stellar's `creditPrice` between the card and the tap, then approve → no run is created and a fresh approval card shows the new price → AC-3
- [ ] Decline the card → nothing starts, one sentence acknowledgement, no question card → AC-3
- [ ] Approve with an approval id that matches no waiting card → "That confirmation has expired" text and no model call → AC-3
- [ ] With an open card, type an answer in your own words ("we are selling already") → `saveAnswer` saves it with `source = 'chat'` and the next card shows; a value outside the options saves nothing and the same card shows with a short reason → AC-8
- [ ] With an open card, type a side question ("how long does this take?") → a short reply, then the same open card again → AC-8
- [ ] Type "change my first answer" mid run → `showQuestion` reopens that card → AC-8, AC-9
- [ ] Type the last answer → the run completes with no extra tap and `data-report` shows → AC-7, AC-8
- [ ] Two typed turns in a row → the second call reads the tools and instructions from the prompt cache (`cacheRead` at least the prefix size) and only the run state note is uncached → AC-13
- [ ] Make the model call fail (bad key on a dev branch) → the turn ends with the `ai_error` try again card, never a blank stream → AC-14
- [ ] A typed turn after an approved run, with each reply saved as a new message → no `MissingToolResultsError`; the model sees the call, the tap and the result → AC-1, AC-3

## Value sourcing

- [ ] Add a test tool to the registry → it appears in the `startRun` enum and description with no edit in `src/assistant/` → AC-2 (startRun enum values, descriptions)
- [ ] The approval card price equals `creditPrice` even when the model sends its own `shownPrice` → AC-3 (approval card price)
- [ ] Each `data-question` carries `progress` from `questionProgress` over the run's answers; answer so a `when` question appears and check the total grows → AC-6 (card view, progress)
- [ ] Completion scores come from `scoreRun`; `answers_changed` once retries, twice shows `complete_retry` → AC-7 (completion scores)
- [ ] The run state note shows the active run's answered count and open question from `runs.getActive`, and after an approved `startRun` the note in the same turn already shows the new run → AC-8 (run state note, active run)
- [ ] With 7 completed runs, the note lists only the newest 5 with their report status → (run state note, last 5 completed runs)
- [ ] With `context.freeMessagesLeft` passed to `handleTurn`, the note shows it; without it, the line is absent → (run state note, free messages left)
- [ ] A typed message with no active run is `metered: true`; during an `in_progress` run, and for card and approval taps, `metered: false` → AC-1 (handleTurn metered)
- [ ] Every AI call uses `models.ts` role `chat` (`claude-opus-5-5`, effort `low`) with no forced tool choice and no thinking setting → AC-13 (AI turn model id, effort)

## UI / manual (once #7 renders the parts)

- [ ] Say "I have a business idea" → Stellar approval card with price and balance; tap Approve → first question card → AC-3, AC-4
- [ ] Ask for homework help → polite one or two sentence decline with a pointer back → AC-10
- [ ] Write in Pidgin → simple English reply with a light Pidgin touch, under about 80 words → AC-11

## Acceptance criteria coverage

- AC-1 covered by the unit and Neon turn tests, the metering step, and the approved run carry on step
- AC-2 covered by the registry tool step
- AC-3 covered by the approve, stale price, decline, expired approval and price source steps
- AC-4 routing seen in the real model step; the 90% bar is measured by the eval harness (milestone 4)
- AC-6 and AC-6b covered by the Neon turn test and the progress step
- AC-7 covered by the completion steps
- AC-8 covered by the typed answer, side question, reopen and note steps
- AC-9 covered by the reopen step and the milestone 3 stop, resume and restart steps
- AC-10, AC-11, AC-12 seen in the real model steps; the pass rates are measured by the eval harness (milestone 4)
- AC-13 covered by the cache and model role steps
- AC-14 covered by the failure step and the mock model failure tests
- AC-5 and AC-5b covered by the milestone 3 prefill steps
- AC-15: milestone 4

## Milestone 3: stop, resume, restart and known facts (updated 2026-11-20)

### Commands

- [ ] `pnpm test -- src/assistant` → the resumeRun, stopRun, restartRun and known facts tests pass on the mock model → AC-3, AC-5, AC-5b, AC-9
- [ ] `pnpm test:integration src/db/queries/credits.int.test.ts` on a throwaway Neon branch → `runQuote` returns the run with its hold amount (null after abandon, not_found for another user); `startFromWithHold` copies answers with sources and holds the price, creates nothing when credits are short, and refuses a not completed, old version or other user's run with no hold → AC-3, AC-9

### Real model or UI (once #7 renders the parts)

- [ ] Pause a Stellar run that still holds its credits, then type "continue my Stellar" → no card, the run resumes and its open card shows → AC-3, AC-9 (resumeRun whether to ask)
- [ ] Release that run's hold (idle sweep, or a direct release on a test branch), then "continue" → an approval card at Stellar's `creditPrice`; approve → a new hold of that amount, then the open card → AC-3 (resume card price)
- [ ] Show the resume card, then put a hold back on the run before tapping Approve → the approval is turned down, the assistant calls again and the run resumes free (no second hold) → AC-3
- [ ] "Stop" a run holding 30 credits → the card says 30 credits come back; approve → run `abandoned`, available balance up by 30, no question card → AC-9 (stop card held amount)
- [ ] "Stop" a run with no hold → the card shows 0 to return; decline → nothing changes → AC-9
- [ ] "Stop" a completed run → no card, the assistant says it is already finished → AC-9
- [ ] After a completed run, "change my channels answer" → a restart card at today's price; approve → a new run with every old answer copied (same sources) and the channels card open → AC-9 (restart price, copied answers)
- [ ] Restart a completed run after bumping the tool's `version` → a fresh run, and a "From your last run" card listing only answers that still parse and are visible; Accept → saved with their old sources → AC-5b (offered answers)
- [ ] Type a message of 40+ characters stating two answers, then approve a start → a "From our chat" card lists just those valid, visible answers, with labels from `formatAnswer`; nothing is saved until Accept → AC-5 (prefill label)
- [ ] Same, with a message under 40 characters → no extraction call, and the first card shows → AC-5
- [ ] Check `ai_usage` after an extraction → one row, purpose `extraction`, `call_key` `<runId>:extraction`, model from the `helper` role → AC-5, AC-13 (extraction model id, usage)
- [ ] Make the helper model fail or take over 8 seconds → the first card shows, plus an `assistant_extract` log with `failed` → AC-5, AC-14

### Coverage

- AC-3 covered by the resume card steps and the turned down approval step
- AC-5 covered by the prefill, short text, usage and failure steps
- AC-5b covered by the version change restart step
- AC-9 covered by the stop, resume and restart steps
