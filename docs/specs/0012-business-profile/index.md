# 0012. Shared business profile

**Date**: 2026-11-26
**Status**: Proposed

## Summary

Each client gets one business profile: a small set of facts about their business (name, website, industry, years running, team size, business model, market reach) gathered from the answers they give in any tool. When a later tool asks one of those questions, the fact shows on the existing prefill card, so the client confirms it with one tap instead of typing it again. Tools word their options differently, so a fact is reused only when it maps cleanly onto the new question's options; otherwise the question is asked. Clients can view, edit and remove their facts on a profile page.

> Written while the engineer was away, on their instruction to go with the recommended picks. Every decision below is the recommended option; review it before building.

## Requirements

**User stories**:
- As a business owner, I want a second BeamX tool to remember what I told the first one, so I am not asked my business name and industry again.
- As a business owner, I want to see and correct what BeamX remembers about my business.
- As a guest who signs up, I want my profile to come with me.

**Acceptance criteria**:
- **AC-1**: A pure catalog in `src/profile/catalog.ts` lists the profile keys, each with a Zod value schema and a plain label: `business_name` (text, up to 100), `business_website` (https URL, up to 200), `industry` (one canonical industry), `years_in_business` (a range `{ min, max | null }` in years), `team_size` (a range `{ min, max | null }` in people), `business_model` (`b2b`, `b2c`, `b2b2c`, `marketplace`), `geographic_scope` (`local`, `regional`, `national`, `international`).
- **AC-2**: A question links to a fact with `fact: { key, toFact, fromFact }` (replacing the bare `factKey`). `toFact(answer)` turns an answer into a fact value or null; `fromFact(fact)` turns a fact into exactly one valid answer for this question, or null when no single option covers it. Both are pure. A contract test checks, for every option of every linked question, that `fromFact(toFact(option))` returns that option.
- **AC-3**: Ranges reuse only when they fit one option: a stored range is read by a bucketed question only if exactly one bucket contains it. Example: Beacon's "1-3 years" (`{1,3}`) is not read by Luna, whose buckets are "1-2 years" and "3-5 years", so Luna asks; Luna's "3-5 years" (`{3,5}`) is read by Beacon as "3-5 years".
- **AC-4**: Industries use a canonical list (appendix) in which some values are narrower than others. A question reads a stored industry only when exactly one of its options covers it: Luna's "restaurants" is read by Beacon as "Food & Beverage", but Beacon's "Food & Beverage" is not read by Luna (it could be restaurants or retail), so Luna asks. "Other" is never stored.
- **AC-5**: When a run completes, every visible answer whose question has a `fact` and a non null `toFact` is written to the profile in the same batch as the completion, with `sourceRunId` and `updatedAt`. An answer whose `source` is `profile` writes nothing (it came from the profile). For each key, the newer `updatedAt` wins.
- **AC-6**: When a new run starts (the `new` path of spec 0006), the prefill card offers profile facts and known chat facts together. A profile fact is offered only when `fromFact` returns a value and the question is visible; a chat fact for the same question wins over the profile. Accepted profile items save with `source = 'profile'`. A run whose every question is covered still shows the card first.
- **AC-7**: The prefill card labels profile items "From your profile" and chat items "From our chat", in one card.
- **AC-8**: `/profile` lists each stored fact with its label, its value in plain words, and where it came from ("From Beacon, 24 Nov" or "You edited this, 24 Nov"). The client can edit a fact with the matching answer card, or remove it. An empty profile says so and points to running a tool. The page is reachable from the account menu ("Business profile"); a guest's facts are kept and used but the page is linked for accounts only.
- **AC-9**: An edit or removal on `/profile` changes only the profile, never past runs or reports.
- **AC-10**: Signing up merges the guest profile into the account (spec 0002): per key the newer `updatedAt` wins, in the `users.linkGuest` batch, and the guest profile row is deleted.
- **AC-11**: Every profile read and write is owner scoped; another user's profile is never read. Deleting the account deletes the profile (cascade).
- **AC-12**: Beacon and Luna link their matching questions: Beacon `business_name`, `industry`, `years_in_business`; Luna `business-name`, `business-website`, `industry`, `company-size`, `years-in-operation`, `business-model`, `geographic-scope` (Luna's when #12 is built). Stellar links none (it asks about an idea, not a running business).

## Decision

**Chosen option**: Option 2, canonical facts with per question mappings, offered on the prefill card.

Facts are stored once in a canonical, tool neutral form. Each question maps to and from that form with two pure functions, and a fact is reused only when the mapping is exact, always through the existing prefill card.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (the table spec 0002 reserved; one migration):
- `business_profile`: `id` uuid PK; `user_id` uuid not null unique, FK `user` ON DELETE CASCADE; `facts` jsonb not null default `'{}'`, shaped `Record<ProfileKey, { value, sourceRunId: uuid | null, updatedAt: ISO string }>`; `created_at`, `updated_at`. `sourceRunId` null means the client edited it.
- `facts` is validated against the catalog on every read and write in `src/profile/`; an unknown key or a value that fails its schema is dropped on read (logged `profile_fact_invalid`), never shown.
- Added to `users.linkGuest` (merge step) and to `link.int.test.ts`.

**State transitions**: a fact is absent → set (run completion or edit) → replaced (newer write) → removed (edit page). No other states.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `profile.get` | DB query | `userId` | `Facts` (parsed) | owner | none (empty when no row) |
| `profile.writeStatements` | DB statement builder | `userId`, `entries: { key, value, sourceRunId, updatedAt }[]` | upsert, newer wins per key | owner | none |
| `runs.complete` | existing query | adds the profile statements to its batch | unchanged | owner | unchanged |
| `/profile` page | route (dynamic) | session | facts view | account session | redirect to sign in for guests |
| `updateFact` | Server Action | `key`, `value` (Zod via catalog) | ok / typed error | account session | `invalid_value`, `not_signed_in` |
| `removeFact` | Server Action | `key` | ok | account session | `not_signed_in` |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| run completion | facts to write | the run's visible answers with `question.fact`, mapped by `toFact`; `sourceRunId` = run id; `updatedAt` = the answer's `updated_at` |
| run completion | skip | answers whose `tool_run_answer.source = 'profile'` |
| new run prefill | offered profile items | `profile.get(owner)` then `question.fromFact(fact.value)` for visible, unanswered questions |
| prefill card | label per item | item source (`profile` or `chat`) |
| `/profile` | value in plain words | catalog `format(value)` (industry label, range "1 to 3 years", "50+ people") |
| `/profile` | "From Beacon, 24 Nov" | `sourceRunId` → `tool_run.tool_id` → registry name; `updatedAt` day in Africa/Lagos; "You edited this" when `sourceRunId` is null |
| `/profile` edit card | question shown | the catalog's own edit question per key (a card view defined in the catalog, not a tool's question) |
| merge | winner per key | later `updatedAt` (spec 0002) |

**Key invariants**:
- One profile row per user (unique `user_id`).
- A stored fact always parses with its catalog schema.
- `fromFact` returns a value only when exactly one option covers the fact; never a guess.
- Profile writes happen in the same batch as the run completion, never after it.
- An edited fact never changes stored answers, scores or reports.

**Security model**: owner only, like every user table. Profile facts are business facts the client typed; no new personal data beyond the business name and website. Server Actions check the session and validate with the catalog. The assistant's prompts do not read the profile in this feature (a later feature may add it to the run state note).

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: complete Beacon, start Luna (when built) or a second Beacon in a new chat → the prefill card shows business name, industry and years from the profile, one tap accepts them, verifies **AC-5**, **AC-6**, **AC-7**
- Mapping: every linked option round trips; Beacon "1-3 years" is not offered to Luna; Luna "restaurants" is offered to Beacon as "Food & Beverage", verifies **AC-2**, **AC-3**, **AC-4**
- Newer wins: a later run's answer replaces the fact; an answer with `source = 'profile'` writes nothing, verifies **AC-5**
- Edit: changing industry on `/profile` changes the next prefill and nothing in past reports, verifies **AC-8**, **AC-9**
- Merge: guest with a newer industry signs up into an account with an older one → newer kept, guest row deleted, verifies **AC-10**
- Auth: another user's facts never appear; a guest posting `updateFact` gets `not_signed_in`, verifies **AC-11**, **AC-8**

## Build plan

Tracer Bullet: one fact end to end first (business name from Beacon to a second Beacon), then the catalog, mappings, page and merge.

1. Migration for `business_profile`; `profile.get` and `profile.writeStatements`; add the statements to `runs.complete`; add the merge to `users.linkGuest`; integration tests, satisfies **AC-5**, **AC-10**, **AC-11**
2. `src/profile/catalog.ts` with the keys, schemas, labels, formatters and the industry list; replace `factKey` with `fact` in the contract and Beacon; the round trip contract test, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-12**
3. Prefill: merge profile facts into the `new` start path and the prefill card labels, satisfies **AC-6**, **AC-7**
4. `/profile` page, edit and remove Server Actions, account menu link, `/design` states with axe, satisfies **AC-8**, **AC-9**
5. End to end: Playwright (Beacon in one chat, a second Beacon in another, prefill from profile, edit on `/profile`), satisfies **AC-5** to **AC-9**

## Consequences

**Positive**:
- One place for "what BeamX knows about my business", reusable by Luna, Beacon and future tools, and later by the assistant.
- Exact mapping means no wrong prefill from a loose guess.

**Negative / tradeoffs**:
- Some facts will not cross tools (Beacon's "1-3 years" never fills Luna's buckets), so a few questions are still asked twice.
- Every new tool question that matches a fact needs a hand written mapping and its round trip test.
- One prefill tap is still a tap; silent skipping was rejected to avoid stale facts.

**Neutral**:
- `factKey` becomes `fact` (a contract change in spec 0005's field, no stored data affected).
- Re-running the same tool with the same answers stays the existing "change my answers" restart (spec 0006); the profile covers only cross tool facts.

## Follow-up

- [ ] Decide whether the assistant's run state note should include profile facts (with #13, ask about your results).
- [ ] Spec 0013 (Luna) links its seven business questions to the catalog.

## Appendix: canonical industries

Narrower values sit under a broader one. A question option covers a value when it maps to that value or to its parent.

| Canonical value | Parent | Beacon option | Luna option |
|---|---|---|---|
| `retail` | none | Retail/Trade | retail |
| `ecommerce` | `retail` | (Retail/Trade covers) | ecommerce |
| `food_beverage` | none | Food & Beverage | none |
| `restaurants` | `food_beverage` | (Food & Beverage covers) | restaurants |
| `professional_services` | none | Professional Services | professional-services |
| `financial_services` | `professional_services` | (covered) | financial-services |
| `real_estate` | none | none | real-estate |
| `beauty_personal_care` | none | Beauty & Personal Care | none |
| `fitness` | `beauty_personal_care` | (covered) | fitness |
| `logistics` | none | Logistics & Transportation | logistics |
| `travel` | `logistics` | (covered) | travel |
| `manufacturing` | none | Manufacturing/Production | manufacturing |
| `hospitality` | none | Hospitality | hospitality |
| `construction` | none | Construction/Trades | none |
| `home_services` | `construction` | (covered) | home-services |
| `healthcare` | none | Healthcare Services | healthcare |
| `education` | none | Education/Training | education |
| `agriculture` | none | Agriculture | none |
| `technology` | none | none | technology |
| `b2b_software` | `technology` | none | b2b-software |
| `media_entertainment` | none | none | media-entertainment |
| `nonprofit` | none | none | nonprofit |

Beacon's "Other" stores nothing and reads nothing (AC-4), so a Luna fact of `real_estate`, `technology`, `b2b_software`, `media_entertainment` or `nonprofit` is not offered to Beacon. Luna has no single option for `food_beverage`, `beauty_personal_care`, `construction` or `agriculture`, so a fact with one of those values is not offered to Luna.
