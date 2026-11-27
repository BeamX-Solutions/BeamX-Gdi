# Verify: Luna marketing plan in chat · spec 0013 · updated 2026-11-27

_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-27)

- `e2e/luna-flow.spec.ts` (scripted fake model) passed on desktop light and phone dark: Luna proposed at 500 credits, 15 cards, leave the chat and come back, the other 35 cards (multiple choice, long text, the skippable website), all five phases written one call at a time, the ready plan, a reload. `beacon-flow`, `profile-flow`, `design`, `report` and `chat` specs still pass.
- Real model run of the five phases (the app's own prompts, schemas and checks, run directly because `api.vercel.com` was unreachable from this machine, which blocked the browser's bot check): every phase on `claude-sonnet-5-5` passed its checks on the first try, with no repair. Analysis took 27 s and 2,672 output tokens, core 22 s and 2,815, overview 14 s and 1,781, operations 18 s and 1,690, assets 15 s and 1,629. The slowest phase used about a fifth of its 135 s timeout. Money came out in naira from the Nigerian answers.
- Assistant eval (`evals/assistant/results/2026-11-26-2.json`) with Luna registered: routing 100% (14/14, "I need a marketing plan for my restaurant" goes to Luna), off topic 100%, no on topic declines, Pidgin 4/4.
- Migration `0006_report_partial` is applied to the dev branch.
- Not run locally on a throwaway branch: the `partial reports` cases in `report-phases.int.test.ts` (no Neon API key here). CI runs them.
- Not yet run in the browser with real models: the whole flow end to end. Run it once `api.vercel.com` is reachable (start `pnpm start` without `E2E_FAKE_AI`, then `npx playwright test e2e/luna-flow.spec.ts --project=desktop-light`).

## UI / manual

- [ ] "I need a marketing plan for my restaurant" → "Start Luna?" with "This uses 500 credits." → AC-1, AC-13
- [ ] Cards show "Your business · Area 1 of 10 · Question 4 of 12", then "<square> · Area n of 10 · Question i of k" → AC-3
- [ ] Long text questions show a text area; the website card has Skip, and a skipped answer shows "Skipped" → AC-2
- [ ] Leave the chat after a few squares and come back → the open card waits; nothing answered is asked again → AC-4
- [ ] After the last card the panel ticks one step at a time ("Studying your business" … "Preparing your templates and ROI") → AC-6, AC-8
- [ ] Close the tab after two steps, reopen the chat → the plan continues from step three → AC-9
- [ ] The ready plan shows: Executive Summary, The Customer Journey, Strategic Insights, Risks and Positioning, Implementation Roadmap (three phases), Resources and Budget, Key Performance Indicators, Templates and Tools, Investment and ROI; no "**" and no em or en dashes → AC-11
- [ ] After Beacon (#9 built), Luna's first card is a prefill offering business name, industry where it maps, and years where it maps → AC-12
- [ ] Force a phase failure (for example a model outage) → Retry resumes at that phase, the saved phases are not rerun, and the third failed call returns the 500 credits → AC-7
- [ ] `/design`: "Luna, two of five phases written" and "Ready, Luna" pass axe in both themes → AC-8, AC-11

## Value sourcing

- [ ] Each claim of a `partial` report keeps `attempts`; only a failed call's Retry adds one (`report-phases.int.test.ts`, `report-runner.test.ts`) → AC-7
- [ ] Two POSTs at once on a partial report start the phase once; the other gets `already_generating` → AC-7
- [ ] The panel POSTs once per new done count (`claimKey`, `report-panel-state.test.ts`) → AC-8
- [ ] The prompts carry the website as an address only, never fetched → AC-14
- [ ] Every Luna phase uses `report_long` (`claude-sonnet-5-5`, low effort), and 2 × 135 s fits the 280 s call budget (contract check) → AC-10, AC-15
- [ ] The phase token budgets match the standalone (12000, 12000, 10000, 9000, 9000) → AC-5

## Commands

- [ ] `pnpm test` → all pass (questions, links, completeness, prompts, checks, view, runner, panel) → AC-1 to AC-12
- [ ] `pnpm test:integration` on a throwaway Neon branch → the partial report cases pass → AC-6, AC-7
- [ ] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → `luna-flow.spec.ts` passes → AC-13

## Acceptance criteria coverage

- AC-1 to AC-5, AC-11, AC-12: `luna.test.ts` · AC-2: `answer-schema.test.ts`, `validate.test.ts` · AC-6, AC-7: `report-runner.test.ts`, `report-phases.int.test.ts` · AC-8, AC-9: `report-panel-state.test.ts`, `luna-flow.spec.ts` · AC-10: `contract.test.ts` · AC-13: `luna-flow.spec.ts`, eval results · AC-14, AC-15: `luna.test.ts`, the real model run above
