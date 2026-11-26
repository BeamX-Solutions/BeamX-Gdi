# Verify: Beacon Pro in chat · spec 0011 · updated 2026-11-26

_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-26)

- Scripted fake model: `e2e/pro-flow.spec.ts` passed on desktop light and phone dark (Beacon, then Pro with reuse, no cards, report, reload).
- Real model run: the same spec passed against `pnpm start` with real Claude (3.3 minutes). Routing went `beacon`, `beacon`, `beacon_pro`. The Pro advisory phase finished on attempt 1 in 31 seconds with no repair: 922 words, `critical_priorities` null (no critical flags for those answers), `growth_opportunities` present.
- Assistant eval: two runs (`evals/assistant/results/2026-11-26.json`, `-2.json`), routing 100% (14/14) including both new Pro cases, off topic 100%, no on topic declines.
- Not run locally: the DB integration tests (`src/db/queries/reuse.int.test.ts`, the `scores` line in `report-phases.int.test.ts`), because there is no Neon API key here to make a throwaway branch. CI runs them on the PR.

## UI / manual

- [ ] Finish a Beacon run, then in a new chat say "I want something deeper" → the card reads "Start Beacon Pro?", "This uses 150 credits." and "Uses your Beacon answers from <day>. Tell me if anything has changed." → AC-3, AC-4
- [ ] Approve it → no question cards; the panel shows the Beacon Pro header, five bars and flag lists at once, then the advisory sections → AC-6, AC-7, AC-13
- [ ] While the advisory is writing, the score preview sits above the "Writing your advisory" step; nothing jumps when it lands → AC-13
- [ ] Ready report order: header "Beacon Pro", "Your five areas", "Critical flags" (only with critical flags), "Opportunities" (only with opportunity flags), then Executive Summary, Critical Priorities (Next 30 Days) when present, Strategic Recommendations, Growth Opportunities when present, Your Next Steps → AC-12
- [ ] Flag lists show plain labels ("Cash crisis"), never codes (`CASH_CRISIS`) → AC-12
- [ ] Answer 10 Beacon cards, then ask for Pro in the same chat → the card names the Beacon answers; after Approve the Beacon run is abandoned with its 50 credits released, and Pro asks only the remaining 13 → AC-3, AC-6
- [ ] Say "my business has changed, I want to answer again" → the Pro card has no reuse line and all 23 cards follow → AC-5
- [ ] Ask "how is Beacon Pro different from Beacon?" → same questions and scores, plus a full advisory; no price in the reply → AC-14
- [ ] After a Beacon report is ready, the assistant mentions Pro at most once in that chat → AC-14
- [ ] Refresh the chat with a ready Pro report → it still shows → AC-16
- [ ] A Stellar and a Beacon report still show the plain skeleton with no preview → AC-13
- [ ] `/design`: "Generating, Beacon Pro with its score preview" panel and the Beacon Pro confirm card with the reuse line pass axe in both themes → AC-4, AC-13

## Value sourcing

- [ ] Reuse source picks this chat's in progress Beacon over a newer completed one in another chat → AC-3
- [ ] Reuse source is the latest completed Beacon or Pro run by `completed_at`, never another user's, never an abandoned run, never a run with no answers → AC-3
- [ ] "24 Nov" uses the Lagos day: a last answer at 23:30 UTC shows the next day (`reuse.test.ts`) → AC-4
- [ ] The price is 150 from `beaconPro.creditPrice`; the model's own `shownPrice` and `reuse` are replaced by the server → AC-4
- [ ] A copied answer that no longer fits Pro's question is dropped and asked (`ai-turn.test.ts`) → AC-6
- [ ] Scores come from the shared `scoreBeacon`; every Beacon fixture scores the same through `beaconPro.score` → AC-2
- [ ] The prompt carries the first name (or "none" for a guest), business facts, category answers, scores and flag labels inside `<client_data>` → AC-11
- [ ] Conditional sections follow `scores.flags`; the check rejects a mismatch, a dash, a URL, or a length outside 700 to 1600 words → AC-9, AC-10
- [ ] The preview comes from `t.scores` in the status query; another user's run returns 404 with no preview → AC-13

## Commands

- [ ] `pnpm test` → all pass → AC-1, AC-2, AC-9 to AC-14
- [ ] `pnpm test:integration` on a throwaway Neon branch → `reuse.int.test.ts` passes (source picking, copy with `based_on_run_id`, abandon plus release in one batch, rollback when short, not_found for a foreign source) → AC-3, AC-6, AC-8
- [ ] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → `pro-flow.spec.ts`, `beacon-flow.spec.ts`, `design.spec.ts` pass → AC-4, AC-13, AC-16
- [ ] Force three advisory failures (for example a model outage) → retry card, then the 150 credits come back → AC-15

## Acceptance criteria coverage

- AC-1, AC-2: `pro.test.ts` · AC-3: `reuse.int.test.ts`, `ai-turn.test.ts` · AC-4: `ai-turn.test.ts`, `chat-view.test.ts`, `/design` · AC-5: `ai-turn.test.ts` · AC-6: `reuse.int.test.ts`, `ai-turn.test.ts`, `reuse.test.ts` · AC-7: `ai-turn.test.ts`, `pro-flow.spec.ts` · AC-8: `ai-turn.test.ts`, `reuse.int.test.ts` · AC-9 to AC-12: `pro.test.ts` · AC-13: `report-status.test.ts`, `report-panel-state.test.ts`, `/design` · AC-14: eval results · AC-15: shared runner (spec 0005 tests), manual step above · AC-16: `pro-flow.spec.ts` (fake and real model)
