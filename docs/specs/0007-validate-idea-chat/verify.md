# Verify: Validate an idea in chat · spec 0007 · updated 2026-11-20

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: chat screens, auth route, POST /api/chat, fake model

Run against a production build: `SKIP_ENV_VALIDATION=1 pnpm build`, then `E2E_FAKE_AI=true pnpm start` (the fake model; leave it unset for the real model).

## UI / manual

- [ ] Open `/` in a fresh browser (no cookies) → the empty chat shows the starter prompts "I have a business idea" and "What can BeamX do?"; the composer is off until the session check finishes, then on; no conversation row exists yet → AC-1
- [ ] Tap "What can BeamX do?" → one guest is signed in (one `user` row with `is_anonymous`), the URL changes to `/c/<uuid>` with no reload, and the reply shows → AC-1
- [ ] On `/`, double tap a starter prompt quickly → still only one guest user is created → AC-1
- [ ] Block `/api/auth/sign-in/anonymous` (devtools request blocking) and send → the "We could not start your chat" card shows and the composer still works → AC-1, AC-11
- [ ] Reload `/c/<uuid>` → the same thread shows, with nothing lost or duplicated → AC-5
- [ ] In a second browser (another guest), open the first guest's `/c/<uuid>` → the 404 page, and none of the first guest's text appears → AC-7
- [ ] Open `/c/<a new valid uuid>` → the empty chat with starter prompts → AC-7
- [ ] Open `/c/not-a-uuid` → the 404 page → AC-7

## Commands

- [ ] `curl -X POST /api/chat` with no session cookie → `401 {"code":"unauthenticated"}` → AC-2
- [ ] POST with a session and `{"conversationId":"nope"}` → `400 {"code":"invalid_request"}`, and no conversation row is created → AC-2
- [ ] POST as guest B with guest A's `conversationId` → `404 {"code":"not_found"}`, and A's chat gains no message → AC-7
- [ ] POST "I have a business idea" as a new guest → the stream starts with `{"type":"start","messageId":<server uuid>}`, holds a `startRun` approval request with `shownPrice: 30`, and ends with `finish`; afterwards the DB has exactly one user and one assistant message for that turn → AC-2
- [ ] POST a request whose `message` carries extra history or an `assistant` role → refused with `400`; only a single new user message is ever saved → AC-2
- [ ] On a Vercel preview with BotID: a scripted POST to `/api/chat` or `/api/auth/sign-in/anonymous` without the BotID client → `403 {"code":"bot"}` → AC-7
- [ ] `pnpm test` → `chat-api.test.ts` passes, including "answers busy to a message sent again before the reply is saved" and "saves the partial reply and frees the lock when the response is cancelled" → AC-2
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
