# Scope: BeamX Workspace (working name)

One chat workspace where a business owner says what they want done, and an AI assistant runs the right BeamX tool for them (Stellar, Beacon, Luna), collects the answers in conversation, shows the report beside the chat, and then talks it through with them. It runs on credits, like an AI platform with tools: each client holds one credit balance, and each tool run (or longer chat) uses a set number of credits. New accounts get starter credits so they see a real report first, and top ups are paid in naira. Booking a BeamX consultation stays the main outcome, with credit sales alongside it. The standalone tools keep running, and this workspace rebuilds their questions, scoring, and report logic inside one app (ported from their source, spec 0001), with room to plug in more tools later.

**Build approach:** Tracer Bullet (get one real thread working end to end through every layer first, then thicken it one strand at a time).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). This is the default level of rigor for the project. `/architect` is the recommended first stop for any feature with a real decision, but you can skip it when you already know how to build the feature. Any feature can carry its own tag (for example `· Beta`) to get more or less rigor.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 23 | Brand font: Montserrat everywhere, wider chat | Foundation | done |
| 20 | Tool source access & parity fixtures | Foundation | in-progress |
| 5 | Tool module contract & registry | Foundation | done |
| 6 | Assistant brain | Foundation | done |
| 7 | Validate an idea in chat (Stellar) | Slice 1 | done |
| 22 | Credits & billing | Slice 1 | done |
| 21 | Abuse & AI cost guards | Slice 1 | done |
| 8 | Accounts & sign up to save | Slice 2 | in-progress |
| 9 | Shared business profile | Slice 2 | in-progress |
| 10 | Beacon health check in chat | Slice 3 | done |
| 11 | Beacon becomes the Claude advisory | Slice 3 | in-progress |
| 12 | Luna marketing plan in chat | Slice 3 | in-progress |
| 13 | Ask about your results | Slice 4 | planned |
| 14 | Chat & report history | Slice 4 | planned |
| 15 | Report PDF & email | Slice 5 | planned |
| 16 | Book a consultation | Slice 5 | planned |
| 17 | File upload | Slice 6 | planned |
| 18 | Privacy, terms & consent | Launch | planned |
| 19 | Public landing page & SEO | Launch | planned |

## Foundations

### 1. Stack & architecture · Beta · done
Decide the stack for the workspace and scaffold a runnable project, so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec, and the empty scaffold boots locally and passes a build.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `./` (`src/`, `package.json`)
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify stack & architecture` (verified manually by the engineer)
- [ ] Test it: `/test stack & architecture` (skipped)

### 2. Coding standards & tooling
Capture conventions from the real scaffold, then install lint, format, and pre commit checks.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and pre commit run clean.
- [x] Capture conventions and tooling choices: `/audit`

### 3. Data model · done
The core records every slice builds on: guests and users, the business profile, conversations and messages, tool runs (answers, scores, report), uploaded files, and consultation requests.
**Done when:** the model supports a guest run that later becomes an account, reports from all four tools, and follow up chat, with no breaking migration needed later.
spec [0002](../specs/0002-data-model/index.md) · code in `src/db`, `src/auth`, `src/lib`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Database and auth foundation: env, id helper, Neon client, minimal Better Auth with uuid id spike (AC-1, AC-6, AC-8, AC-11)
  - [x] Thin thread end to end: schema and first migration, scripts, happy path test on a real Neon branch (AC-1, AC-3, AC-9, AC-11, AC-12)
  - [x] Thicken the query layer: conversations, messages, runs with pause and resume, reports, usage, plus their tests (AC-2, AC-3, AC-4, AC-5, AC-8, AC-9, AC-10)
  - [x] Guest link, deletion, CI: link batch in `onLinkAccount`, cascade tests, Neon branch per CI run (AC-6, AC-7, AC-11)
- [x] Verify it: `/check verify data model`

### 4. Design system & UI foundation · done
The look and the building blocks of a modern AI chat workspace: the chat thread, the composer, inline answer cards (tap to answer), a report panel beside the chat, and loading and streaming states. It should feel like BeamX.
**Done when:** `design.md` covers type, color, spacing, and the chat components, and the base components work on mobile and with a keyboard.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `src/components`, `src/app/design`, `e2e`, `DESIGN.md`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Thin thread, tokens to CI: shadcn init, light and dark tokens, Inter, next-themes, flagged `/design` page, Playwright + axe job, first `DESIGN.md` (AC-1, AC-2, AC-3, AC-13, AC-14, AC-15)
  - [x] Workspace shell: header, history rail and drawer, resizable report panel, mobile report sheet, on fixtures (AC-4, AC-5, AC-14, AC-15)
  - [x] Chat thread, composer, and answer cards: AI Elements restyled, live region, composer rules, four card kinds, answered bubble, run progress bar (AC-6, AC-7, AC-8, AC-9, AC-10, AC-15)
  - [x] Report parts, errors, and the finished `DESIGN.md`: score, bars, advice, sections, skeleton, error card, full axe pass (AC-1, AC-3, AC-11, AC-12, AC-15)
- [x] Verify it: `/check verify design system & UI foundation`

### 23. Brand font: Montserrat everywhere, wider chat · done
All text uses Montserrat, the BeamX brand font, so the workspace looks like BeamX, and on desktop the chat column widens to 64rem so the conversation uses more of the screen (updated 2026-11-21; the first version used Montserrat for headings only).
**Done when:** all text shows in Montserrat (Inter gone), the chat column is up to 64rem wide on desktop, and axe and the 360px and 1280px checks still pass in both themes.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) (Milestones 5 and 6, AC-4, AC-16) · code in `src/app/layout.tsx`, `src/app/globals.css`, `src/components`, `DESIGN.md`
- [x] Design it (spec): `/architect design system: switch the font to Montserrat` (updated: all text, 64rem chat)
- [x] Build it: `/develop brand font: Montserrat everywhere, wider chat`
  - [x] Load Montserrat as `--font-heading`, the heading rule and the title classes, `DESIGN.md` and `/design` type scale, full Playwright pass (AC-1, AC-3, AC-16)
  - [x] Montserrat as the only sans font (Inter and `--font-heading` removed), chat column 64rem, `DESIGN.md` and `/design`, full Playwright pass (AC-1, AC-3, AC-4, AC-16)
- [x] Verify it: `/check verify brand font: Montserrat everywhere, wider chat`

### 20. Tool source access & parity fixtures · in-progress
Get read access to the source code of Beacon, Beacon Pro, Luna, and Stellar, and capture real answer sets with the scores and verdicts the live tools give them. The rebuilt tools are tested against these so they score the same way (from spec 0001).
**Done when:** all four source repos are readable by the team, and each tool has at least 5 fixture answer sets with its original scores, verdict, and report captured in the repo.
Fixtures are captured (PR #5; Luna has no scoring, so it carries its question set and plan shape). Still owed: team read access to Stellar's repo, which lives on a personal account (`chimaobi-ibeh/biv`).
code in `fixtures/parity`, `scripts/parity`
- [x] Gather access and capture fixtures: `/develop tool source access & parity fixtures`

### 5. Tool module contract & registry · done
The tools are rebuilt inside the workspace, ported from their source (spec 0001). This is the one typed contract every tool implements (its questions, a pure scoring function, its report prompt, its report view, its credit price) and the registry the assistant reaches tools through, so a new tool is added by adding one folder. The contract has to fit three real shapes found in the sources: fixed scoring plus one AI call (Stellar), one scoring engine whose report changed style between versions (Beacon, spec 0011), and a plan written by AI in phases with no scoring (Luna).
**Done when:** a sample tool plugs in by adding one folder and one registry line, its scoring is tested against fixtures, and a failed report step shows a clear, retryable error.
spec [0005](../specs/0005-tool-module-contract/index.md) · code in `src/tools`, `src/assistant`, `src/db/queries/reports.ts`, `src/components/report`
- [x] Design it (spec): `/architect tool module contract & registry`
- [x] Build it: `/develop tool module contract & registry`
  - [x] Contract, kit, registry and the Stellar pure port with parity tests (AC-2, AC-3, AC-4, AC-5, AC-6, AC-14, AC-16)
  - [x] AI SDK 7, models, cost and spend cap hook, report queries, and the runner with a mock model (AC-8, AC-9, AC-10, AC-12, AC-15)
  - [x] Report routes with after() and polling status, version and stale handling (AC-7, AC-10, AC-13, AC-15)
  - [x] Report blocks, renderer, panel states on /design, and the contract test over the registry (AC-1, AC-11, AC-13)
- [x] Verify it: `/check verify tool module contract & registry`

### 6. Assistant brain · done
How the assistant understands what the client wants, picks the right tool, asks the questions as answer cards, skips anything it already knows, and stays on BeamX topics.
**Done when:** given "I have a business idea" or "how healthy is my business", the assistant picks the right tool, walks the questions, and politely declines off topic requests.
spec [0006](../specs/0006-assistant-brain/index.md) · code in `src/assistant`, `src/db/queries/credits.ts`, `evals/assistant`
- [x] Design it (spec): `/architect assistant brain`
- [x] Build it: `/develop assistant brain`
  - [x] Provider check, models, message parts, card flow and the deterministic turn path with the turn lock and owner lookup (AC-1, AC-6, AC-6b, AC-7, AC-13)
  - [x] AI turn: instructions, run state note, registry built startRun with approval, typed answers and reopening cards (AC-2, AC-3, AC-4, AC-8, AC-10, AC-11, AC-12, AC-14)
  - [x] Known facts extraction and prefill card, stop, resume and restart with credits.startFromWithHold (AC-3, AC-5, AC-5b, AC-9)
  - [x] Real model eval harness and the first committed results (AC-4, AC-10, AC-11, AC-12, AC-15)
- [x] Verify it: `/check verify assistant brain`

## Slice 1: First real thread

### 7. Validate an idea in chat (Stellar) · done
The walking skeleton. A guest types an idea, the assistant routes to Stellar, collects the 10 answers as cards, runs the real scoring and AI analysis, and shows the green, yellow, or red report in the panel. It is saved to the guest session. No accounts, PDF, or history yet.
**Done when:** a guest goes from first message to a saved Stellar report on screen, using real data and real AI, and a refresh keeps the report.
spec [0007](../specs/0007-validate-idea-chat/index.md) · code in `src/app`, `src/auth`, `src/components/workspace`, `src/components/credits`, `src/db/queries`
- [x] Design it (spec): `/architect validate an idea in chat`
- [x] Build it: `/develop validate an idea in chat`
  - [x] Chat screens, auth route and client with BotID, POST /api/chat with one writer per turn and the fake model (AC-1, AC-2, AC-5, AC-7)
  - [x] useChat client, part renderers, report panel wiring, credit cards and the client chip (AC-3, AC-4, AC-9, AC-10, AC-11)
  - [x] Resumable streams and message limits (AC-6, AC-8)
  - [x] Playwright full flow with axe, and a real model run (AC-4, AC-12)
- [x] Verify it: `/check verify validate an idea in chat`

### 22. Credits & billing · Beta · done
Clients pay for tool runs with credits from one balance. Each tool has a fixed price per run, and chat beyond a small daily free allowance costs a little. The assistant always confirms before spending ("this uses 30 credits, go ahead?"). Credits are held when a run starts, charged when the report arrives, and released if it fails; Luna's phased plan resumes without charging twice. New accounts get starter credits, top ups are paid through Paystack in naira, credits expire after 12 months of inactivity (with a reminder first), and existing Luna credit balances move in. Comes right after the first Stellar thread and before any public link.
**Done when:** a client sees a tool's price, confirms, and is charged only when the report arrives (a failed run costs nothing), can buy credits with Paystack, and sees their balance and history; prices and the free chat allowance come from config.
spec [0004](../specs/0004-credits-billing/index.md) · code in `src/billing`, `src/db`, `src/app/credits`, `src/app/api/webhooks/paystack`, `src/components/credits`
- [x] Design it (spec): `/architect credits & billing`
- [x] Build it: `/develop credits & billing`
  - [x] Thin thread: a guest pays for a Stellar run with starter credits (config, ledger and holds migration, hold on approve, charge on report ready, release on failure, confirm card, header chip) (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-11, AC-14, AC-18, AC-20, AC-21)
  - [x] Hold lifecycle and paid chat: resume and reconfirm, daily cron with idle and chat hold sweeps, free allowance and metered chat, guest grant IP cap, charge once across phases (AC-2, AC-6, AC-7, AC-9, AC-10, AC-11, AC-21)
  - [x] Disconnect is never a stop: drain the stream copy when the Redis buffer fails, reword the Stop comments, tee billing test (AC-10)
  - [x] Buying credits, after #8 sign up: payment table, Paystack client, checkout, callback, webhook, pending sweep, buy from the card, `/credits` page (AC-8, AC-13, AC-14, AC-21)
  - [x] Accounts and money operations, after #8: sign up grant, Luna import and claim, guest link merge, deletion, adjust script, expiry (behind a flag) and drift check (AC-11, AC-12, AC-15, AC-16, AC-17, AC-19, AC-20)
- [x] Verify it: `/check verify credits & billing`
- [x] Test it: `/test credits & billing`

### 21. Abuse & AI cost guards · Beta · done
Guest chat and starter credits still trigger paid AI calls, so cap abuse and spend before any public link: per guest and per IP rate limits, a bot check on guest start and chat, input and output size limits, and a daily AI spend cap (rules and defaults decided in spec 0001).
**Done when:** a guest over a limit, or any guest after the daily spend cap trips, gets a friendly message instead of an AI call, and the limits come from config.
spec [0008](../specs/0008-abuse-cost-guards/index.md) · code in `src/lib` (`limits.ts`, `spend-cap.ts`, `client-ip.ts`), `src/assistant`, `src/auth/guest-limit.ts`, `src/app/api`
- [x] Design it (spec): `/architect abuse & ai cost guards`
- [x] Build it: `/develop abuse & ai cost guards`
  - [x] Thin thread: client IP and limits modules, env config, the spend total on every AI call with the tripped marker, and the guest spend cap at chat (AC-1, AC-2, AC-3, AC-9, AC-10, AC-11)
  - [x] Run approval: guest flag and IP into the tools, guest spend cap and atomic run limits in startRun and restartRun, the cards in the turn (AC-2, AC-4)
  - [x] Chat route limits: burst windows, daily guest chat, new chat bound in turnContext, the new notices (AC-5, AC-6, AC-7)
  - [x] Guest sign in IP cap with its client card, the /design showcase and an e2e notice check (AC-8, AC-2, AC-5, AC-7)
  - [x] Card burst window: card taps get their own 30 a minute window, only typed messages create chats (AC-7, AC-12)
- [ ] Verify it: `/check verify abuse & ai cost guards` (skipped)
- [ ] Test it: `/test abuse & ai cost guards` (skipped)

## Slice 2: Accounts and memory

### 8. Accounts & sign up to save · Beta · in-progress
Sign up or sign in, and carry the guest's run into the new account so nothing is lost.
**Done when:** a guest who finished a run signs up and finds that report in their account, signed in users only see their own data, and unclaimed guest data is deleted automatically after 30 days.
spec [0009](../specs/0009-accounts-sign-up/index.md) · code in `src/auth`, `src/email`, `src/app/api/auth`, `src/app/api/account`, `src/app/api/cron/billing`, `src/billing/cron.ts`, `src/components`, `src/db/queries/users.ts`
- [x] Design it (spec): `/architect accounts & sign up to save`
- [ ] Build it: `/develop accounts & sign up to save`
  - [x] Thin thread: code emails, email sign up through the code with the guest linked and the password set, the header account menu and sign out (AC-1, AC-2, AC-3, AC-6, AC-8, AC-11, AC-12, AC-17)
  - [x] Sign in and forgot password (AC-5, AC-7, AC-10)
  - [x] Abuse guards, the verified account hook, and the sign up prompts on reports and notices (AC-1, AC-15, AC-16)
  - [x] Delete account and the daily guest purge (AC-13, AC-14, AC-18)
  - [ ] Later: Google sign in with account linking, once the Google OAuth client exists (AC-4, AC-9)
- [x] Verify it: `/check verify accounts & sign up to save`
- [x] Test it: `/test accounts & sign up to save`

### 9. Shared business profile · in-progress
One profile (name, industry, size, location, goals, and so on) built from answers across tools, so the client never answers the same question twice. They can view and edit it.
**Done when:** after one tool run, a second tool skips the questions the profile already answers, and the client can edit the profile.
Design note (spec 0012): "skips" means the known facts arrive on the prefill card for a one tap confirm, and a fact crosses tools only when it maps exactly onto the new question's options.
spec [0012](../specs/0012-business-profile/index.md) (recommended picks, written while the engineer was away; review before building)
- [x] Design it (spec): `/architect shared business profile`
- [x] Build it: `/develop shared business profile` · code in `src/tools/_kit/facts.ts`, `src/db/queries/profile.ts`, `src/assistant/prefill.ts`, `src/app/profile`, `src/components/profile`
  - [x] Profile table, writes at run completion, guest merge (AC-5, AC-10, AC-11)
  - [x] Fact catalog, question mappings and round trip test (AC-1 to AC-4, AC-12)
  - [x] Profile facts on the prefill card (AC-6, AC-7)
  - [x] `/profile` page with edit and remove, and the end to end flow (AC-8, AC-9)
- [ ] Verify it: `/check verify shared business profile`

## Slice 3: The other tools

### 10. Beacon health check in chat · done
Run the Beacon business health check through chat, using the same thread as Stellar. This builds the Beacon module (22 questions plus the business name, and one scoring engine); its advice was the rule based advisory, polished by Claude (the standalone used OpenAI). #11 replaced that advice with the full Claude advisory (Beacon v2); v1 reports still open.
**Done when:** a client gets a Beacon score with category breakdown and advice in the report panel, matching what the standalone Beacon gives for the same answers (scores, grades, flags, and rule based advice; the AI wording is not compared).
spec [0010](../specs/0010-beacon-health-check/index.md)
- [x] Design it (spec): `/architect beacon health check in chat`
- [x] Build it: `/develop beacon health check in chat` · code in `src/tools/beacon/`
  - [x] Questions, scoring and the typed rule advisory with both parity tests (AC-2, AC-3, AC-4, AC-5, AC-6)
  - [x] Contract additions (first name, phase check) in the runner, then the Beacon report phase, view and registry line (AC-1, AC-7, AC-8, AC-9, AC-10)
  - [x] The `rich_section` block on `/design` with axe (AC-11)
  - [x] Thread end to end: Playwright flow, a real model run, and the assistant eval results (AC-12, AC-13)
- [x] Verify it: `/check verify beacon health check in chat` · core flow verified 2026-11-24; real model steps (AC-7, AC-8) and the report failure path (AC-12) skipped, Anthropic API out of credit; see verify.md

### 11. Beacon becomes the Claude advisory · in-progress
Decided 2026-11-26: there is one health check, and it is the premium one. The old rule based Beacon is scrapped and the standalone Beacon Pro's full Claude advisory ships under the name Beacon (v2), at 150 credits, so prices rise Stellar (30), Beacon (150), Luna (500). The score shows at once and the advisory lands when Claude finishes; older v1 reports keep opening.
**Done when:** a client gets a Beacon score with its five areas and flags straight away, then the full advisory in the panel; older Beacon reports still open; Beacon costs 150 credits.
spec [0011](../specs/0011-beacon-advisory/index.md)
- [x] Design it (spec): `/architect beacon becomes the claude advisory`
- [x] Build it: `/develop beacon becomes the claude advisory` · code in `src/tools/beacon/` (`report.ts`, `view.ts`, `flags.ts`, `verdicts.ts`, `v1-*.ts`), `src/assistant/report-status.ts`, `src/db/queries/reports.ts`, `src/components/report`
  - [x] The advisory phase, check, view and score preview (AC-5 to AC-9)
  - [x] Beacon v2 at 150, v1 reader, rule advisory removed (AC-1 to AC-4)
  - [x] Assistant eval and the end to end thread (AC-10 to AC-12)
- [ ] Verify it: `/check verify beacon becomes the claude advisory`

### 12. Luna marketing plan in chat · in-progress
Run Luna's long questionnaire (50 questions: 12 about the business, 38 across 9 marketing areas) in chat without wearing the client out. Progress is shown, the client can stop and resume, and the plan is generated at the end. Luna has no scoring: the plan is written by Claude in five phases in a row, which won't fit in one request, so each finished phase is saved and a failure resumes from the phase that broke.
Design note (spec 0001, 2026-11-22): the app runs on Vercel Hobby (300 seconds per function call), so the plan runs one phase per call, chained on the server, the way the standalone Luna already runs on Hobby; spec 0005's AC-7 changes with it.
**Done when:** a client can pause midway, come back, finish, and get the full marketing plan in the panel, and a plan that fails partway resumes from the failed phase.
Design note (spec 0013): one phase per call, continued by the report panel's poll (as the standalone Luna's browser does); a closed tab pauses the plan until the client returns.
spec [0013](../specs/0013-luna-marketing-plan/index.md) (recommended picks, written while the engineer was away; review before building)
- [x] Design it (spec): `/architect luna marketing plan in chat`
- [ ] Build it: `/develop luna marketing plan in chat`
  - [ ] One phase per call: contract field, `partial` status, attempts per failed call, per call budget (AC-6, AC-7, AC-10)
  - [ ] Panel continuation and reopen (AC-8, AC-9)
  - [ ] Luna questions, cards, progress by square (AC-1 to AC-4)
  - [ ] The five phases and the plan view (AC-5, AC-11)
  - [ ] Profile links, eval, end to end with pause and a phase failure (AC-12, AC-13)
- [ ] Verify it: `/check verify luna marketing plan in chat`

## Slice 4: Conversation around results

### 13. Ask about your results · needs a decision
After a report, the client asks follow ups ("why is my cost score low?", "what should I do first?") and gets answers grounded in their own reports and profile.
**Done when:** answers cite the client's actual scores, and the assistant says when something is not in their reports instead of guessing.
- [ ] Design it (spec): `/architect ask about your results`

### 14. Chat & report history
A sidebar of past chats and reports, like the big AI assistants, so a client can reopen and continue any of them.
**Done when:** a signed in client sees past chats and reports, opens one, and continues the conversation.
- [ ] Build it: `/develop chat & report history`

## Slice 5: Take it away and talk to BeamX

### 15. Report PDF & email · needs a decision
Download any report as a branded PDF, or have it emailed, as the standalone tools do today.
**Done when:** every tool's report downloads as a PDF and arrives by email with the PDF attached.
- [ ] Design it (spec): `/architect report pdf & email`

### 16. Book a consultation · needs a decision
After a report, the assistant offers BeamX's free 30 minute consultation and books it in chat. BeamX staff get the client's context and reports. This is the main success measure. All four standalone tools book through BeamX's Calendly today (`calendly.com/beamxsolutions`).
**Done when:** a client books a consultation from chat, gets a confirmation, and BeamX receives the booking with the related reports.
- [ ] Design it (spec): `/architect book a consultation`

## Slice 6: Bring your own documents

### 17. File upload · needs a decision
Clients attach files (financials, a pitch deck, a sales export) that the assistant reads to fill in answers and ground follow up answers.
**Done when:** a client uploads a file, the assistant uses it to prefill answers they can confirm, and files stay private to their account.
- [ ] Design it (spec): `/architect file upload`

## Launch

### 18. Privacy, terms & consent · needs a decision · Beta
A privacy notice, terms, cookie consent, and a way for clients to export or delete their data. Required because the workspace stores business data (Nigeria's data protection law, and GDPR for clients abroad).
**Done when:** consent is captured before tracking, the policies are linked everywhere, and a client can delete their account and all their data.
- [ ] Design it (spec): `/architect privacy, terms & consent`

### 19. Public landing page & SEO · needs a decision
A public page that explains the workspace and starts a guest chat. It has proper metadata, a sitemap, and social cards so it can be found and shared.
**Done when:** the page renders server side with metadata and social cards, and its main button opens a guest chat.
- [ ] Design it (spec): `/architect public landing page & seo`

## Deferred
Left out of the current build pass, kept here so the plan stays honest.
- **Tool chaining journeys**: for example, validate an idea, then build its marketing plan with answers carried over · needs a decision
- **Staff console**: an internal BeamX view of clients, reports, and bookings · needs a decision · Beta (needs a durable audit table for staff access, guest links, and deletions first, from spec 0002)
- **Analytics & error monitoring**: measure signups, completed runs, and bookings, and catch failures · needs a decision
- **Accessibility audit (WCAG AA)**: a full pass beyond the base components' keyboard support
- **General business advisor**: open business questions beyond the four tools · needs a decision
- **More languages**: localized interface and reports
- **Chat Stop button**: stop a streaming reply and pay only for what arrived, via a stop endpoint that aborts the AI call across function instances (from spec 0004) · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the step whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills find it by that `(spec)` suffix, never by an exact label. Every other box is an execution box, and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves. Each row shows what the feature looks like and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise go straight to `/develop` (or `/audit` for standards and tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here.** The scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (built before this workflow) and `dropped` (taken out of scope, kept for history).
- **Approach tag** beside a heading (for example `· Facade`) overrides the project default for that feature; no tag means it inherits the default.
- **Workflow tier tag** beside a heading (for example `· Beta`, `· GA`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, meaning what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link is added by `/architect`, the code path by `/develop`.
