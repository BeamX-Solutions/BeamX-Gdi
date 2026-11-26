# Verify: Shared business profile · spec 0012 · updated 2026-11-26

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Recorded during the build (2026-11-26)

- `e2e/profile-flow.spec.ts` (scripted fake model) passed on desktop light and phone dark: Beacon in one chat, a second Beacon in a new chat with "From your profile" on the prefill card, `/profile` showing "From Beacon", an industry edit ("You edited this"), and a removal; axe clean at each step.
- `beacon-flow.spec.ts`, `design.spec.ts`, `report.spec.ts`, `chat.spec.ts` still pass.
- The migration `0005_business_profile` is applied to the dev branch and the table is live.
- Not run locally on a throwaway branch: `src/db/queries/profile.int.test.ts` (no Neon API key here). CI runs it.

## UI / manual

- [ ] Finish Beacon, then start Beacon in a new chat → the prefill card is titled "From your profile" with the business name, industry and years → AC-5, AC-6
- [ ] Accept all → those answers save with `source = 'profile'` and complete without rewriting the profile's dates → AC-5
- [ ] When the chat also mentioned a fact, the card is titled "What I already know" and each item says "From your profile" or "From our chat" → AC-7
- [ ] Account menu → "Business profile" opens `/profile` with each fact, its value in words and "From Beacon, <day>" → AC-8
- [ ] Edit Industry → pick "Restaurants" → the row shows "Restaurants" and "You edited this, <day>"; a past Beacon report is unchanged → AC-8, AC-9
- [ ] Remove a fact → the row disappears; the next Beacon asks that question → AC-8
- [ ] As a guest, `/profile` shows the sign in note; after signing up, the guest's facts are on the account's profile → AC-8, AC-10
- [ ] Delete the account → its profile row is gone → AC-11

## Value sourcing

- [ ] A fact's `updatedAt` is the answer's own `updated_at`, and `sourceRunId` is the completed run → AC-5
- [ ] An answer with `source = 'profile'` writes nothing; a later client answer replaces the fact → AC-5
- [ ] Beacon "1-3 years" is not offered to a question with 1-2 / 3-5 buckets; Luna style "3-5 years" is read by Beacon as "3-5 years" (`facts.test.ts`) → AC-3
- [ ] A stored "restaurants" is offered to Beacon as "Food & Beverage"; Beacon's "Food & Beverage" is not offered to a question without that exact option; "Other" stores nothing → AC-4
- [ ] The guest merge keeps the newer fact per key (`profile.int.test.ts`) → AC-10
- [ ] "<day>" uses the Lagos day (`profile-rows.test.ts`) → AC-8

## Commands

- [ ] `pnpm test` → all pass (catalog, mappings, editors, prefill merge, rows, card labels) → AC-1 to AC-8
- [ ] `pnpm test:integration` on a throwaway Neon branch → `profile.int.test.ts` passes → AC-5, AC-8 to AC-11
- [ ] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → `profile-flow.spec.ts` and the "Business profile" block on `/design` pass axe → AC-6 to AC-9

## Acceptance criteria coverage

- AC-1 to AC-4: `facts.test.ts`, the contract round trip check · AC-5: `profile.int.test.ts`, `readers.test.ts` (`runFacts`) · AC-6, AC-7: `prefill.test.ts`, `ai-turn.test.ts`, `prefill-origin.test.ts` · AC-8, AC-9: `profile-rows.test.ts`, `facts.test.ts` (editors), `profile-flow.spec.ts` · AC-10, AC-11: `profile.int.test.ts` · AC-12: `questions.test.ts` (Beacon; Luna with #12)
