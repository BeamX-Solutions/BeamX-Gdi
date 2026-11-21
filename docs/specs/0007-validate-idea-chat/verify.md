# Verify: Validate an idea in chat · spec 0007 · updated 2026-11-20

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: chat screens, auth route, POST /api/chat, fake model

Run against a production build: `SKIP_ENV_VALIDATION=1 pnpm build`, then `E2E_FAKE_AI=true pnpm start` (the fake model; leave it unset for the real model).

## UI / manual

- [ ] Open `/` in a fresh browser (no cookies) → the empty chat shows the starter prompts "I have a business idea" and "What can BeamX do?"; the composer is off until the session check finishes, then on; no conversation row exists yet → AC-1
- [ ] Tap "What can BeamX do?" → one guest is signed in (one `user` row with `is_anonymous`), the URL changes to `/c/<uuid>` with no reload, and the reply shows → AC-1
- [ ] On `/`, double tap a starter prompt quickly → still only one guest user is created → AC-1
- [x] Block `/api/auth/sign-in/anonymous` (devtools request blocking) and send → the "We could not start your chat" card shows and the composer still works → AC-1, AC-11
- [ ] Reload `/c/<uuid>` → the same thread shows, with nothing lost or duplicated → AC-5
- [x] In a second browser (another guest), open the first guest's `/c/<uuid>` → the 404 page, and none of the first guest's text appears → AC-7
- [x] Open `/c/<a new valid uuid>` → the empty chat with starter prompts → AC-7
- [x] Open `/c/not-a-uuid` → the 404 page → AC-7

## Commands

- [ ] `curl -X POST /api/chat` with no session cookie → `401 {"code":"unauthenticated"}` → AC-2
- [ ] POST with a session and `{"conversationId":"nope"}` → `400 {"code":"invalid_request"}`, and no conversation row is created → AC-2
- [x] POST as guest B with guest A's `conversationId` → `404 {"code":"not_found"}`, and A's chat gains no message → AC-7
- [ ] POST "I have a business idea" as a new guest → the stream starts with `{"type":"start","messageId":<server uuid>}`, holds a `startRun` approval request with `shownPrice: 30`, and ends with `finish`; afterwards the DB has exactly one user and one assistant message for that turn → AC-2
- [ ] POST a request whose `message` carries extra history or an `assistant` role → refused with `400`; only a single new user message is ever saved → AC-2
- [x] On a Vercel preview with BotID: a scripted POST to `/api/chat` or `/api/auth/sign-in/anonymous` without the BotID client → `403 {"code":"bot"}` → AC-7
- [x] `pnpm test` → `chat-api.test.ts` passes, including "answers busy to a message sent again before the reply is saved" and "saves the partial reply and frees the lock when the response is cancelled" → AC-2
- [ ] `pnpm test:integration` on a throwaway Neon branch → `turn-context.int.test.ts` passes → AC-2, AC-8

## Value sourcing

- [ ] Conversation id: the client made UUID v7 is the row's `conversation.id` (compare the URL to the DB) → AC-1
- [ ] User: the conversation's `user_id` is the anonymous session's user → AC-1
- [ ] History for the AI: send a request with a forged earlier assistant message in the body → it is refused, and the model sees only saved rows → AC-2
- [ ] Typed message count: with a run in progress, send 2 typed messages and 1 card tap → `turnContext` reports 2 (taps and messages from before the run don't count) → AC-8
- [ ] `/c/[id]` thread: the page shows exactly the rows `conversations.open` returns for the owner → AC-5
- [ ] Model replies (e2e): with `E2E_FAKE_AI=true` the replies match `src/lib/fake-model.ts`; on a deploy with `VERCEL_ENV=production` and `E2E_FAKE_AI=true`, the app refuses to boot → invariant
- [ ] `ai_usage`: after an AI turn, one row with `call_key` `<assistant message id>:chat` and `purpose` `chat`; with the fake model it is recorded at cost 0 with an `ai_cost_unknown_model` log → AC-2

## Acceptance-criteria coverage (milestone 1)

- AC-1: starter prompts, first send sign in, single guest, sign in failure card, URL change, conversation id and user sourcing
- AC-2: 401/400 cases, one message per turn, history injection, busy before save, cancel saves and frees, usage row
- AC-5: reload keeps the thread, page shows `conversations.open` rows
- AC-7: other owner 404 (page and POST), unknown uuid empty, bad uuid 404, BotID 403
- AC-3, AC-4, AC-6, AC-8 (notices), AC-9 to AC-12: later milestones

## Milestone 2: chat client, part renderers, report panel, credit cards, chip

Same setup: a production build with `E2E_FAKE_AI=true pnpm start`, a fresh browser (no cookies) for each guest. Updated 2026-11-21.

### UI / manual

- [ ] On `/`, tap "I have a business idea" → the confirm card reads "Start Stellar?", "This uses 30 credits." and "You have 30 credits available.", with Approve and Not now; no chip shows yet (no account) → AC-3, AC-9
- [ ] Tap Not now → the card says "Not started", no `tool_run` and no `credit_hold` row exist, and the chip stays hidden → AC-3
- [ ] In a new chat, tap Approve → the card says "Approved", one `credit_account` with the 30 starter grant and one active 30 credit hold exist, the chip shows "0 credits", and the first card (or the "From our chat" prefill card) shows → AC-3, AC-9
- [ ] Answer a card → it collapses into your answer bubble with Edit; Edit reopens it with the old answer picked, and a new answer replaces it (only the newest bubble per question keeps Edit) → AC-3
- [ ] On a prefill card, Accept all saves the listed answers (`source = 'chat'`) and shows the next card; Edit on one item keeps the others and opens that question's card → AC-3
- [ ] Answer all 11 cards → the "View report" card shows, the panel opens beside the chat with the generating skeleton, then the green, yellow or red Stellar report; the hold becomes `charged` and the chip still shows "0 credits" → AC-4, AC-9
- [ ] At 390px wide, finish a run → the report opens as a full screen sheet by itself; close it and the "View report" card opens it again with focus returned on close → AC-4
- [ ] Reload `/c/<uuid>` after the report → the thread, the answer bubbles (no Edit) and the report panel show; the chip is seeded from the server with the right number → AC-5, AC-9
- [ ] Reload `/c/<uuid>` while the report is still generating → the panel resumes the skeleton and turns into the report without a second claim (one `report_claimed` log per attempt) → AC-5
- [ ] Set the guest's `credit_account.balance` to 0 (no holds), ask for Stellar and approve → the short balance card says "You need 30 credits more for this run." with the guest line and no button → AC-10
- [ ] With a run in progress, type "stop" → the stop card reads "Stop this run? Your 30 credits held will be returned."; Stop the run releases the hold and the chip goes back up → AC-9
- [ ] Force a `complete_retry` (change an answer row between the last tap and completion) → the "Something changed while saving" card's Try again completes the run → AC-11
- [ ] Tap a card twice fast while the first tap is in flight → the second tap is ignored (cards are off while a turn runs); if the server still answers `busy`, the "One moment" card's Send again resends the tap → AC-11
- [x] Make the report fail (stop the network during generation) → the panel shows the friendly Retry card, never a blank panel → AC-11

### Commands

- [x] `pnpm test` → `chat-view.test.ts`, `credit-copy.test.ts`, `chat-copy.test.ts` and the new `ai-turn.test.ts` cases (account balance on the card, failed balance read shows no card, summary on the approved start) pass → AC-3, AC-9, AC-10
- [ ] `pnpm test:integration` on a throwaway Neon branch → `report-api.int.test.ts` passes, including the GET's `summary` and the failed summary read that leaves it out → AC-9
- [x] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → axe passes on `/design` with the confirm, stop, short balance, prefill cards and the chip, in both themes at 360 and 1280px → AC-11

### Value sourcing

- [ ] Confirm card available balance: with no account it is `billingConfig.grants.starter` (30); give an account 12 available and it shows 12; with `credits.getSummary` failing, no card shows and nothing is held → AC-3
- [ ] Confirm card price: change Stellar's `creditPrice` between the card and the tap → the approval is refused and nothing is held → AC-3
- [ ] Chip seed: the header's server read (`credits.getSummary`) matches `credit_account.balance - held` on both `/` and `/c/<uuid>` → AC-9
- [ ] Chip updates: the number changes from the approval result's `summary`, the stop result's `summary`, and the report GET's `summary`, each without a reload → AC-9
- [ ] Short balance card: the shortfall equals the `insufficient_credits` result's `shortfall` (price minus available) → AC-10
- [ ] Stop card held amount: equals the run's active hold (`credits.runQuote`), and the plain "Stop this run?" shows when there is none → AC-9
- [ ] Report panel: shows the newest `data-report` run; the status is the report GET for that run → AC-4, AC-5

### Acceptance-criteria coverage (milestone 2)

- AC-3: confirm card price and balance, approve holds and shows the first or prefill card, decline starts nothing, card answers and edits
- AC-4: all cards to the report, panel and phone sheet, charge on ready
- AC-5: reload with a report and while generating
- AC-9: chip hidden with no account, seeded on the server, updated from approval, stop and report status
- AC-10: guest short balance card
- AC-11: complete_retry, busy, report failure cards
- AC-6, AC-8, AC-12: later milestones

## Milestone 3: resumable streams and limits · updated 2026-11-21

_Reconnecting needs Redis close to the app. From a laptop far from Frankfurt, each Upstash call takes over a second and `resumable-stream`'s fixed 1 second handshake gives up, so a reload simply shows the saved message. Check the resume steps on a Vercel preview (functions in `fra1`, Redis in `eu-central-1`)._

### UI / manual

- [x] On a preview, ask a question that gets a long reply; reload `/c/<id>` while it is still typing → the same reply carries on and finishes, with no text missing and none twice → AC-6
- [x] Same, but turn the network off in DevTools for a few seconds mid reply, then back on and reload → the reply completes once → AC-6
- [x] Reload after the reply has finished → the saved message shows, and the network tab shows `GET /api/chat/<id>/stream` answering `204` → AC-6
- [x] Open `/` in a fresh private window → no `GET …/stream` request is made, and no guest is created before the first send → AC-1, AC-6
- [ ] Paste 4,001 characters and send (bypass the composer cap, for example with a request from DevTools) → "That message is too long" card with Got it, no AI call, and nothing saved after a reload → AC-8
- [x] Got it on a limit card → the card goes away → AC-8
- [ ] In a run, send 40 typed messages, then a 41st → "This run has reached its message limit"; card and approval taps still work → AC-8

### Commands

- [x] `pnpm vitest run src/lib/resumable.test.ts` → the real `resumable-stream` library resumes through the Upstash adapters (a reader joining partway gets the whole reply once, a finished stream resumes to null, the `chat:active` pointer keeps its 5 minute expiry and is only cleared by its own turn) → AC-6
- [x] `pnpm vitest run src/assistant/chat-api.test.ts` → limit notices (4,000 passes, 4,001 refused, the 40th typed message passes, the 41st refused, taps never counted), and busy turns never made resumable → AC-6, AC-8
- [ ] In Upstash's Data Browser during a reply on the preview → a `chat:active:<conversationId>` key with a TTL under 300, gone once the reply is saved → AC-6

### Value sourcing (milestone 3)

- [ ] Limits: change `MAX_MESSAGE_CHARS` to 10 on a preview, and a 11 character message gets the notice → AC-8
- [ ] Typed message count: only messages with a `text` part since the active run's `created_at` count (taps in the same run don't move it) → AC-8
- [ ] Resume stream: the stream comes from `chat:active:<conversationId>`; a second chat's reload never picks up the first chat's reply → AC-6

### Acceptance-criteria coverage (milestone 3)

- AC-6: resume mid reply, after a network drop, after the reply finished, no request on a new chat, the adapter tests
- AC-8: too long text, the 41st typed message, taps never counted, Got it dismisses

## Milestone 4: full flow e2e and a real model run · updated 2026-11-21

### UI / manual

- [ ] Real model, a weak idea: pick the weakest answer on each card → a yellow or red verdict whose badge, icon and bars match the score (the 2026-11-21 run only covered green: 100/100, "Good") → AC-4
- [ ] Real model, phone width: the report opens as a full screen sheet, and the sheet's report text scrolls with the keyboard (Tab to "Report contents", then the arrow keys) → AC-4, AC-3

### Commands

- [x] `ENABLE_DESIGN_PAGE=true pnpm build && pnpm exec playwright test e2e/flow.spec.ts` → 4 passed (phone and desktop, light and dark): first message, URL `/c/<id>`, confirm card for 30 credits, approve, every card, report from the fake model, chip at 0, reload keeps it, axe clean on `/`, the ready report, and `/c/<id>` → AC-1, AC-3, AC-4, AC-5, AC-9, AC-12
- [ ] On a PR, the CI `e2e` job creates a `ci-e2e-*` Neon branch, migrates it, runs the suite, and deletes the branch afterwards (check the Neon console) → AC-12
- [ ] The test server runs with `E2E_FAKE_AI=true` (playwright.config.ts), so the suite makes no Anthropic calls: the Anthropic console shows no usage for a CI run → AC-12

### Notes

- From a laptop far from Frankfurt, running all e2e tests at once can drop database requests ("Error connecting to database: fetch failed"), and the flow test then fails on its first send. Run `e2e/flow.spec.ts` on its own, or rely on CI.
- The full flow found a real accessibility gap: the report's scroll area could not be reached with a keyboard (`scrollable-region-focusable`). Fixed with `viewportLabel` on `ScrollArea`.

### Acceptance-criteria coverage (milestone 4)

- AC-12: the full flow test on four projects, axe on `/`, the ready report and `/c/<id>`, the fake model in CI on a throwaway branch
- AC-4: the real model run (green covered; yellow and red still owed above)
