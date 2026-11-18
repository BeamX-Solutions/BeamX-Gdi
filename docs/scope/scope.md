# Scope: BeamX Workspace (working name)

One chat workspace where a business owner says what they want done, and an AI assistant runs the right BeamX tool for them (Beacon, Beacon Pro, Luna, Stellar), collects the answers in conversation, shows the report beside the chat, and then talks it through with them. It is free and works as a lead funnel: the goal is to get clients to book a BeamX consultation. The four standalone tools keep running, and this workspace rebuilds their questions, scoring, and report logic inside one app (ported from their source, spec 0001), with room to plug in more tools later.

**Build approach:** Tracer Bullet (get one real thread working end to end through every layer first, then thicken it one strand at a time).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). This is the default level of rigor for the project. `/architect` is the recommended first stop for any feature with a real decision, but you can skip it when you already know how to build the feature. Any feature can carry its own tag (for example `· Beta`) to get more or less rigor.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 20 | Tool source access & parity fixtures | Foundation | planned |
| 5 | Tool module contract & registry | Foundation | planned |
| 6 | Assistant brain | Foundation | planned |
| 7 | Validate an idea in chat (Stellar) | Slice 1 | planned |
| 21 | Abuse & AI cost guards | Slice 1 | planned |
| 8 | Accounts & sign up to save | Slice 2 | planned |
| 9 | Shared business profile | Slice 2 | planned |
| 10 | Beacon health check in chat | Slice 3 | planned |
| 11 | Beacon Pro in chat | Slice 3 | planned |
| 12 | Luna marketing plan in chat | Slice 3 | planned |
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

### 4. Design system & UI foundation · in-progress
The look and the building blocks of a modern AI chat workspace: the chat thread, the composer, inline answer cards (tap to answer), a report panel beside the chat, and loading and streaming states. It should feel like BeamX.
**Done when:** `design.md` covers type, color, spacing, and the chat components, and the base components work on mobile and with a keyboard.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `src/components`, `src/app/design`, `e2e`, `DESIGN.md`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Thin thread, tokens to CI: shadcn init, light and dark tokens, Inter, next-themes, flagged `/design` page, Playwright + axe job, first `DESIGN.md` (AC-1, AC-2, AC-3, AC-13, AC-14, AC-15)
  - [x] Workspace shell: header, history rail and drawer, resizable report panel, mobile report sheet, on fixtures (AC-4, AC-5, AC-14, AC-15)
  - [x] Chat thread, composer, and answer cards: AI Elements restyled, live region, composer rules, four card kinds, answered bubble, run progress bar (AC-6, AC-7, AC-8, AC-9, AC-10, AC-15)
  - [x] Report parts, errors, and the finished `DESIGN.md`: score, bars, advice, sections, skeleton, error card, full axe pass (AC-1, AC-3, AC-11, AC-12, AC-15)
- [ ] Verify it: `/check verify design system & UI foundation`

### 20. Tool source access & parity fixtures
Get read access to the source code of Beacon, Beacon Pro, Luna, and Stellar, and capture real answer sets with the scores and verdicts the live tools give them. The rebuilt tools are tested against these so they score the same way (from spec 0001).
**Done when:** all four source repos are readable by the team, and each tool has at least 5 fixture answer sets with its original scores, verdict, and report captured in the repo.
- [ ] Gather access and capture fixtures: `/develop tool source access & parity fixtures`

### 5. Tool module contract & registry · needs a decision
The tools are rebuilt inside the workspace, ported from their source (spec 0001). This is the one typed contract every tool implements (its questions, a pure scoring function, its report prompt, its report view) and the registry the assistant reaches tools through, so a new tool is added by adding one folder.
**Done when:** a sample tool plugs in by adding one folder and one registry line, its scoring is tested against fixtures, and a failed report step shows a clear, retryable error.
- [ ] Design it (spec): `/architect tool module contract & registry`

### 6. Assistant brain · needs a decision
How the assistant understands what the client wants, picks the right tool, asks the questions as answer cards, skips anything it already knows, and stays on BeamX topics.
**Done when:** given "I have a business idea" or "how healthy is my business", the assistant picks the right tool, walks the questions, and politely declines off topic requests.
- [ ] Design it (spec): `/architect assistant brain`

## Slice 1: First real thread

### 7. Validate an idea in chat (Stellar) · needs a decision
The walking skeleton. A guest types an idea, the assistant routes to Stellar, collects the 10 answers as cards, runs the real scoring and AI analysis, and shows the green, yellow, or red report in the panel. It is saved to the guest session. No accounts, PDF, or history yet.
**Done when:** a guest goes from first message to a saved Stellar report on screen, using real data and real AI, and a refresh keeps the report.
- [ ] Design it (spec): `/architect validate an idea in chat`

### 21. Abuse & AI cost guards · Beta
Guests trigger paid AI calls for free, so cap abuse and spend before any public link: per guest and per IP rate limits, a bot check on guest start and chat, input and output size limits, and a daily AI spend cap (rules and defaults decided in spec 0001).
**Done when:** a guest over a limit, or any guest after the daily spend cap trips, gets a friendly message instead of an AI call, and the limits come from config.
- [ ] Build it: `/develop abuse & ai cost guards`

## Slice 2: Accounts and memory

### 8. Accounts & sign up to save · needs a decision · Beta
Sign up or sign in, and carry the guest's run into the new account so nothing is lost.
**Done when:** a guest who finished a run signs up and finds that report in their account, signed in users only see their own data, and unclaimed guest data is deleted automatically after 30 days.
- [ ] Design it (spec): `/architect accounts & sign up to save`

### 9. Shared business profile · needs a decision
One profile (name, industry, size, location, goals, and so on) built from answers across tools, so the client never answers the same question twice. They can view and edit it.
**Done when:** after one tool run, a second tool skips the questions the profile already answers, and the client can edit the profile.
- [ ] Design it (spec): `/architect shared business profile`

## Slice 3: The other tools

### 10. Beacon health check in chat
Run the Beacon business health check through chat, using the same thread as Stellar.
**Done when:** a client gets a Beacon score with category breakdown and advice in the report panel, matching what the standalone Beacon gives for the same answers.
- [ ] Build it: `/develop beacon health check in chat`

### 11. Beacon Pro in chat
Run the deeper Beacon Pro assessment, with its report streaming in live. The assistant suggests Pro when a client wants more depth than Beacon.
**Done when:** a client gets a Beacon Pro report that streams into the panel, and the assistant can explain how Pro differs from Beacon.
- [ ] Build it: `/develop beacon pro in chat`

### 12. Luna marketing plan in chat · needs a decision
Run Luna's long questionnaire (60+ questions, 9 areas) in chat without wearing the client out. Progress is shown, the client can stop and resume, and the plan is generated at the end.
**Done when:** a client can pause midway, come back, finish, and get the full marketing plan in the panel.
- [ ] Design it (spec): `/architect luna marketing plan in chat`

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
After a report, the assistant offers BeamX's free 30 minute consultation and books it in chat. BeamX staff get the client's context and reports. This is the main success measure.
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
- **Paid tier & billing**: premium reports or deeper follow up · needs a decision · GA
- **General business advisor**: open business questions beyond the four tools · needs a decision
- **More languages**: localized interface and reports

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
