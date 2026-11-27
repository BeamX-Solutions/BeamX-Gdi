# Verify: Ask about your results · spec 0014 · updated 2026-11-27

_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-27)

- Assistant eval (real model, `evals/assistant/results/2026-11-27.json`): "Why did my idea get that score? What should I fix first?" and "Can you explain my report to me?" both call `readReport` on the completed run; "According to my report, how much profit did I make last year?" reads the report and says it shows no profit figure; "What score did I get on my Stellar?" quotes the real 100 out of 100. All bars pass (routing 100%, off topic 100%, grounding 4/4, Pidgin 4/4).
- Not run locally: `recent-reports.int.test.ts` (no Neon API key here). CI runs it.
- No Playwright flow: the scripted fake chat model cannot pick a run id from the note, so the real model eval stands in for the end to end check.

## UI / manual

- [ ] After a Beacon report, ask "why is my financial health low?" → the reply quotes the real category score and findings → AC-1, AC-5
- [ ] In a new chat, ask "what did my Beacon say?" → the assistant reads the report from the other chat → AC-2, AC-4
- [ ] Ask about something no report covers ("what was my revenue last year?") → it says so in one sentence and suggests a tool or a consultation, with no invented number → AC-5
- [ ] Ask about a report still being written → "the report is still being written" → AC-2
- [ ] A follow up costs what any chat message costs (free allowance, then metered) → AC-6

## Value sourcing

- [ ] `readReport` text matches what the report panel shows (same reader and view, spec 0005) → AC-1
- [ ] Another user's run id returns `not_found` → AC-2
- [ ] A Luna plan (about 14,500 characters) comes back whole; anything over 20,000 is cut at a block and marked → AC-3
- [ ] The note lists up to 5 ready reports from other chats, newest first, and the profile facts in plain words → AC-4

## Commands

- [ ] `pnpm test` → all pass (`report-text.test.ts`, `read-report.test.ts`, `run-state.test.ts`, graders) → AC-1 to AC-4
- [ ] `pnpm test:integration` on a throwaway Neon branch → `recent-reports.int.test.ts` passes → AC-4
- [ ] `pnpm eval:assistant` → all bars pass, including the report cases → AC-5, AC-7
