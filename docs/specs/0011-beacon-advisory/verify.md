# Verify: Beacon becomes the Claude advisory · spec 0011 · updated 2026-11-26

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-26)

- Scripted fake model: `e2e/beacon-flow.spec.ts` passed on desktop light and phone dark (150 credit card, sign up, staff top up, 23 cards, score then advisory, reload keeps it).
- Real model run: the same spec passed against `pnpm start` with real Claude (2.7 minutes). Routing went `beacon` twice; the advisory phase finished on attempt 1 in 35 seconds with no repair.
- Assistant eval: `evals/assistant/results/2026-11-26.json`, routing 100% (13/13, including "a proper personal plan" going to Beacon), off topic 100%, no on topic declines.
- `/design`, report and chat e2e specs: all pass in the four layouts.
- `e2e/flow.spec.ts` (Stellar) failed locally because this machine's IP had used up today's guest starter grants (spec 0004, AC-11) after many test runs; the guest starts with 0 credits. Not caused by this change; CI runs from a fresh IP.

## UI / manual

- [ ] "How healthy is my business?" → the card reads "Start Beacon?" and "This uses 150 credits." → AC-1
- [ ] Approve and answer the 23 cards → the panel shows the Beacon header, five bars and flag lists at once, above "Writing your advisory" → AC-9
- [ ] When it lands: header "Beacon", "Your five areas", "Critical flags" (only with critical flags), "Opportunities" (only with opportunity flags), then Executive Summary, Critical Priorities (Next 30 Days) when present, Strategic Recommendations, Growth Opportunities when present, Your Next Steps; nothing jumps → AC-8, AC-9
- [ ] Flag lists show plain labels ("Cash crisis"), never codes (`CASH_CRISIS`) → AC-8
- [ ] Open an older Beacon v1 report → it shows its original layout (What we found, rule sections, Talk to BeamX) → AC-3
- [ ] A Beacon v1 run left in progress → "continue" starts a v2 run with the old answers offered on the prefill card → AC-4
- [ ] A Stellar report shows the plain skeleton, no preview → AC-9
- [ ] Refresh with a ready Beacon report → it still shows → AC-12
- [ ] `/design`: "Generating, Beacon with its score preview", "Ready, Beacon" and "Ready, Beacon v1 (older report)" pass axe in both themes → AC-3, AC-8, AC-9

## Value sourcing

- [ ] The price is 150 from `beacon.creditPrice`; the model's own `shownPrice` is replaced by the server → AC-1
- [ ] Scores come from `scoreBeacon` with no `advisory` key; every standalone fixture still scores the same (`scoring.parity.test.ts`) → AC-2
- [ ] The prompt carries the first name (or "none" for a guest), business facts, category answers, scores and flag labels inside `<client_data>` → AC-7
- [ ] Conditional sections follow `scores.flags`; the check rejects a mismatch, a dash, a URL, or a length outside 700 to 1600 words → AC-5, AC-6
- [ ] The preview comes from `t.scores` in the status query; another user's run returns 404 with no preview → AC-9

## Commands

- [ ] `pnpm test` → all pass → AC-1 to AC-10
- [ ] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → `beacon-flow.spec.ts`, `design.spec.ts`, `report.spec.ts` pass → AC-8, AC-9, AC-12
- [ ] Force three advisory failures (for example a model outage) → retry card, then the 150 credits come back → AC-11

## Acceptance criteria coverage

- AC-1, AC-3: `report.test.ts` · AC-2: `scoring.test.ts`, `scoring.parity.test.ts` · AC-4: shared version change tests (spec 0005, 0006) · AC-5 to AC-8: `report.test.ts`, `fake-model.test.ts` · AC-9: `report-status.test.ts`, `report-panel-state.test.ts`, `report-payload.test.ts`, `/design` · AC-10: eval results · AC-11: shared runner tests (spec 0005), manual step above · AC-12: `beacon-flow.spec.ts` (fake and real model)
