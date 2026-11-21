# 0007. Validate an idea in chat (Stellar thread)

**Date**: 2026-11-20
**Status**: In Progress

## Summary

This is the first full thread through every layer. A guest types an idea on the home page, and the assistant (spec 0006) offers Stellar for 30 credits. The guest approves, taps through the cards, and sees the real green, yellow or red report in the panel (spec 0005), with credits held and then charged (spec 0004). It wires the chat route, saving messages on the server, resuming a stream after a refresh, the chat screen, and the credit cards and header chip. Chat stays free, and rate limits and the spend cap come with #21 and the paid chat milestone, before any public link.

## Requirements

**User stories**:
- As a guest, I want to type my idea and get a real Stellar report without signing up, so I see BeamX's value first.
- As a guest on a weak connection, I want a refresh or a dropped network to keep my chat, my answers and my report.

**Acceptance criteria**:
- **AC-1**: On `/`, an empty chat shows starter prompts ("I have a business idea", "What can BeamX do?"). Nothing is created until the first send. The composer is disabled while the session state loads. On the first send, the client signs the guest in anonymously (Better Auth, through `/api/auth/[...all]`, BotID checked) if there is no session. An in flight guard stops a second send from creating a second guest, and a failed sign in shows an error card with the composer still usable. The conversation is created under the client generated UUID v7 id. The URL changes to `/c/[id]` (no reload) only after the first response headers arrive.
- **AC-2**: `POST /api/chat` takes `{ conversationId, message }` (only the new user message; the server loads history from the DB). `handleTurn` (spec 0006) saves the user message after it takes the turn lock (idempotent on the client uuid; card and approval taps are stored as parts), so a `busy` request saves nothing. The route wraps both paths in `createUIMessageStream`, whose `onFinish` writes exactly one assistant message per turn: text, tool and approval parts, and the server added cards. Only after the reply is saved does it call the turn's `release`, so the turn lock covers the whole turn, the save included: a tap sent again before the reply is saved gets the `busy` notice and can't run an approval or a completion twice. For AI turns, it then records `ai_usage` from the turn's `usage` (`callKey` `<assistantMessageId>:chat`). The client can't add or edit history.
- **AC-3**: "I have a business idea: …" gets the Stellar confirm card showing "30 credits" and the available balance. Approving holds 30 credits (creating the account with its starter grant on first approval, spec 0004 AC-11) and shows the prefill card or the first of the 11 cards. Declining starts nothing.
- **AC-4**: Answering every card completes the run and shows the view report card. The report panel opens (a full screen sheet on phones), shows the generating skeleton, then the real Stellar report from Claude Opus 5.5. 30 credits are charged, and the header chip drops to 0.
- **AC-5**: A refresh of `/c/[id]` at any point shows the saved thread (`conversations.open`, one round trip), with the open card still live during a run, the report panel when a report exists, and the generating state resumed by polling (spec 0005).
- **AC-6**: A refresh or network drop during an AI reply reconnects to the same stream (`resumable-stream` on Upstash), with no lost or duplicated text. When the stream has already finished, the saved message shows.
- **AC-7**: A conversation owned by another user returns the 404 page on `/c/[id]`, and `404` on `POST /api/chat`, with nothing changed. An unknown but valid uuid on `/c/[id]` shows the empty chat. A request failing BotID gets `403` and a friendly card.
- **AC-8**: Limits for now: typed text over `MAX_MESSAGE_CHARS` (4,000) is refused before any AI call, with a friendly notice. The 41st typed message within one run (`RATE_LIMIT_MESSAGES_PER_RUN`, 40) gets a friendly "this run has reached its message limit" notice, with no AI call. Card taps, approval taps and retries don't count. Limit notices are shown, not saved. Other abuse limits wait for #21.
- **AC-9**: The header credit chip (a client component, seeded by the header's server read of `credits.getSummary`) shows the available credits once the user has a credit account. It updates from the summary returned with the approval result, the stop result and the report status (spec 0005 GET). A guest with no account sees no chip.
- **AC-10**: The short balance card (spec 0004 AC-8) shows the shortfall. In #7, the guest version says an account will offer more credits, with no button until #8.
- **AC-11**: No path shows a blank screen or a raw 500. AI errors, `busy`, limits, BotID and report failures all render the friendly cards from specs 0003, 0005 and 0006.
- **AC-12**: A Playwright test runs the whole flow (first message → approve → 11 cards → ready report → refresh keeps it) against a production build with the scripted fake model, plus axe on `/` and `/c/[id]` (light and dark, phone and desktop).

## Decision

**Chosen option**: Option 1: a thin route over `handleTurn`, with the client sending only the new message (reasoning in [rationale.md](rationale.md)).

`/` and `/c/[id]` share one chat screen built from the spec 0003 shell. `POST /api/chat` checks BotID and the session, makes sure the conversation exists, saves the user message, delegates to `handleTurn`, and saves the reply in `onFinish`, with the stream made resumable through `resumable-stream` on Upstash. `useChat` (AI SDK 7) renders the spec 0006 parts with the existing answer cards, confirm cards, error cards and report panel.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `ai-elements` (`vercel/ai-elements`, `.claude/skills/ai-elements/`) · `next-cache-components-adoption` (`vercel/next.js`, `.claude/skills/next-cache-components-adoption/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `upstash-redis-js` (`.claude/skills/upstash-redis-js/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Routes and files

```
src/app/page.tsx                    new chat (static shell; client chat with no id yet)
src/app/c/[id]/page.tsx             saved chat: session plus conversations.open inside Suspense; notFound() for other owners
src/app/api/chat/route.ts           POST, maxDuration 300 (spec 0001)
src/app/api/chat/[id]/stream/route.ts  GET resume: the active stream for the conversation, or 204
src/app/api/auth/[...all]/route.ts  Better Auth handler; checkBotId() first for POST /sign-in/anonymous
src/auth/client.ts                  createAuthClient with anonymousClient (new)
src/components/workspace/chat.tsx   client: useChat, part renderers, first send sign in, URL replace
src/components/workspace/credit-chip.tsx
src/components/credits/confirm-card.tsx, short-balance-card.tsx, stop-card.tsx
src/db/queries/conversations.ts     + ensureStatements(userId, id) and turnContext(userId, conversationId): one batch (see the flow)
src/db/queries/messages.ts          + typedUserCountSince statement (user messages with a text part, after a time)
src/lib/fake-model.ts               scripted AI SDK mock models for e2e: routing replies keyed by user text, a fixed extraction reply, a fixed Stellar report. Active only when E2E_FAKE_AI=true and NODE_ENV is not production, checked at runtime in env.ts
```

Before building pages, read `node_modules/next/dist/docs/` on Cache Components, `params` and route handlers (`AGENTS.md`): the shell is static, and session or DB reads sit inside Suspense.

### `POST /api/chat` flow

1. `checkBotId()`. On failure, `403` JSON `{ code: "bot" }`.
2. Session (Better Auth). None means `401` JSON. The client's transport signs in anonymously again and retries once.
3. Zod body: `conversationId` (uuid), `message` (a UI message with a client uuid id; parts limited to `text` or the spec 0006 user data parts). Bad input is `400` JSON.
4. `conversations.turnContext(userId, conversationId)`, one `db.batch`: insert the conversation if absent (`ON CONFLICT (id) DO NOTHING`), read its owner, `runs.getActive`, and the typed user message count since the active run's `created_at`. Another owner returns `404` JSON.
5. Notices before the turn, sent as a one message UI stream with a `data-error` part (not saved): typed text over `MAX_MESSAGE_CHARS` (`limit_text`), or a typed count at `RATE_LIMIT_MESSAGES_PER_RUN` (`limit_run`).
6. `handleTurn(deps, { userId, conversationId, message, context })` reuses `context` (owner, active run) instead of reading again. It takes the turn lock, then saves the user message, then returns `{ stream, metered, usage, release }`:
   - `metered` is only logged for now (charging comes with the credits paid chat milestone).
   - `usage` is a promise of the AI turn's token totals, `{ model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`: tokens from `result.totalUsage` (cache fields from `inputTokenDetails.cacheReadTokens` and `cacheWriteTokens`, missing counts as 0), and `model` from the last step's `response.modelId`, so a provider fallback is priced as the model that answered. It settles on every ending (finish, approval request, stream error, cancel): to the totals of the steps that ran, or `null` when no step reported usage. It never rejects and never hangs. It is `null` for card turns. Known facts extraction keeps recording its own row (spec 0006).
   - `release` frees the turn lock. It is always a function, idempotent, and never throws (the compare and delete makes a second or late call harmless). Card turns hold the lock until `release`, exactly like AI turns; `handleTurn` frees the lock itself only when it returns no stream (`not_found`, `invalid_message`, a thrown error). On a busy turn no lock was taken and `release` does nothing. Notices (step 5) and errors before `handleTurn` take no lock and never call it.
7. The route makes the assistant message id once, at the start of the request (`newId()`), never inside `onFinish`, so a retried `onFinish` keeps the same id and `callKey`. It returns `createUIMessageStreamResponse` over `createUIMessageStream`, which merges `handleTurn`'s stream (AI or deterministic). `release` is wired in before the route awaits anything after `handleTurn`; if building the stream throws, a `catch` calls `release`. Its `onFinish`, in order:
   1. Saves the single assistant message, in its own `try`/`catch` (a failure is logged).
   2. Calls `release`.
   3. Records `ai_usage` when `usage` settles to a value (`purpose` `chat`, cost from `costUsd` in `src/lib/ai-cost.ts`), in its own `try`/`catch`. A model with no price is recorded at cost 0 with an `ai_cost_unknown_model` log, never skipped. The usage write needs no lock, so a slow one never holds the next turn.

   The owner for both writes comes from `conversations.ownerOf`, in case a guest links mid stream. A `finally` around the merged stream calls `release` too, so a cancel or stream error frees the lock even if `onFinish` doesn't run; `release` being idempotent makes the double call safe. If the function dies, the lock's expiry frees it.
7a. Lock lifetime: the chat route sets `maxDuration` to 90 seconds and the turn lock expiry becomes 120 seconds (`TURN_LOCK_TTL_S`), so no turn outlives its lock and lets a second turn run beside it.
8. Resumable streams: `resumable-stream` with the Upstash client and `waitUntil` set to Next's `after`. The stream id is stored at `chat:active:<conversationId>` (5 minute expiry), replaced by each new turn, and deleted in `onFinish`. `GET /api/chat/[id]/stream` resumes that stream, or returns `204` when the key is absent.

Errors before any stream starts are typed JSON (`400`, `401`, `403`, `404`). The client transport maps them to error cards (`401` retries once). Nothing returns a raw 500.

### Client (`chat.tsx`)

- `useChat({ id: conversationId, generateId: newId, resume: true, transport })`. The transport sends only the last message plus `conversationId`, and points the resume GET at `/api/chat/[id]/stream`.
- Session state from `authClient.useSession()`. The composer is disabled while it loads.
- First send on `/`: an in flight guard, then `authClient.signIn.anonymous()` if there is no session (on failure, an error card and the guard is released), then send, then `history.replaceState` to `/c/[id]` once the response headers arrive.
- The report POST from `data-report` may fire again after a remount. That's safe, because spec 0005's claim makes it idempotent.
- Part renderers: `text` (AI Elements message), `data-question` (answer cards, only the latest one live), `data-answer` (answered bubble), `data-prefill` (prefill card), `data-report` (view report card, which opens the panel and POSTs the report once), `data-error` (error card), tool approval parts (confirm card, stop card), `insufficient_credits` results (short balance card).
- The chip updates from the `summary` field returned with the approval result, the stop result and the report status GET. #7 adds `summary` (available, held) to those three results, read with `credits.getSummary` in the same request.

### Credit UI

| Element | Shows | Source |
|---|---|---|
| Confirm card | tool name, price, available balance, Approve and Not now | approval input `shownPrice` and `availableBalance`, written by spec 0006's approval hook: `credits.getSummary` when an account exists, else `config.grants.starter` (spec 0004). If the real grant at approval is smaller, the short balance card appears then |
| Short balance card | shortfall, packs (accounts), guest text | the `insufficient_credits` tool result (spec 0004) |
| Stop card | stop question, held amount | `heldAmount` (spec 0006) |
| Header chip | "N credits" | `credits.getSummary` (available = balance minus held) in the header's server component; hidden with no account |

**Data model sketch**: no new tables or columns. New query `conversations.turnContext(userId, conversationId)`: one batch of insert if absent, then an owner read (`absent` cannot happen after the insert, so the result is `owned` or `other_owner`), then `runs.getActive`, then the count of user messages with a `text` part after the active run's `created_at`. `messages.append` becomes idempotent on the message id (`ON CONFLICT (id) DO NOTHING`), if it isn't already. The resumable stream id lives in Upstash only.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/chat` | POST | `conversationId` (uuid), `message` (UI message) | UI message stream (resumable) | session (guest or account), BotID | JSON `400` invalid, `401` no session, `403` bot, `404` other owner; notices `limit_text`, `limit_run`, `busy` as `data-error` stream parts |
| `/api/auth/[...all]` | GET, POST | Better Auth | session cookie | BotID on anonymous sign in | `403` bot |
| `/api/chat/[id]/stream` | GET | `id` | the active stream, or `204` | session, owner | `404` |
| `/c/[id]` | page | `id` | thread, runs, report panel | session, owner | 404 page |
| report routes | | | | | spec 0005 |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| first send | conversation id | client `newId()` (UUID v7), checked to be a uuid by Zod |
| first send | user | Better Auth anonymous session |
| route | history for the AI | `conversations.open` inside `handleTurn` (spec 0006); never the client |
| route | run start time for the limit | `runs.getActive` (`created_at`) |
| route | limits | `MAX_MESSAGE_CHARS` (4000, new) and `RATE_LIMIT_MESSAGES_PER_RUN` (40, spec 0001) through `src/lib/env.ts` |
| route | typed message count | `conversations.turnContext` (user messages with a `text` part since the active run started) |
| chip | updates | `summary` on the approval result, the stop result and the report status GET |
| confirm card | available balance | server written `availableBalance` (above) |
| header chip | credits | `credits.getSummary` |
| `/c/[id]` | thread and report | `conversations.open` (messages, runs with reports, one batch) |
| resume | stream | Upstash key `chat:active:<conversationId>` |
| e2e | model replies | `src/lib/fake-model.ts` script, keyed by the user text |

**Key invariants**:
- Messages are written only by the server. The client sends one new user message per request.
- Every request acts as the session user. Conversations, runs and reports are owner scoped.
- No AI call happens before BotID, the session, the ownership check and the limits pass.
- The fake model can never run in a production deployment.

**Security model**:
- Guests are real anonymous users (spec 0001). BotID guards the chat route and the anonymous sign in. Another user's ids return 404 with no detail.
- Client parts are validated against the spec 0006 schemas, and the `runId` in them is never trusted (spec 0006).
- Data protection (NDPA 2023, GDPR): chat and answers are stored in Neon Frankfurt and sent to Anthropic (spec 0001). Logs carry ids only.
- Known gap until #21: no per guest or per IP rate limits and no daily spend cap. No public link before #21 and the credits paid chat milestone.

**Configuration required**:
- `MAX_MESSAGE_CHARS` (default 4000, new) and `RATE_LIMIT_MESSAGES_PER_RUN` (default 40, spec 0001), through `env.ts` (including its skip branch) and `.env.example`.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (spec 0001): the turn lock and resumable streams; added to `env.ts` now if they aren't already.
- `E2E_FAKE_AI`: makes the AI calls use `fake-model.ts`. It is honoured only when `NODE_ENV` is not `production`, checked at runtime. `pnpm e2e` sets it on `next start`; deployments never do.
- BotID: the `botid` package, with `withBotId` in `next.config` and `initBotId` on the client for `/api/chat` and `/api/auth/sign-in/anonymous`. No secret needed.

**Critical test scenarios**:
- Happy path (Playwright, fake model): first message → URL `/c/[id]` → approve → 11 cards → report ready → chip 0 → refresh keeps everything, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-9**, **AC-12**
- Real model (manual, `/check verify`): the same flow with Claude, checking that the report is real and the colors are right, verifies **AC-4**
- Resume: kill the connection mid reply (Playwright offline toggle); on reload the text completes once, verifies **AC-6**
- Ownership: user B opens A's `/c/[id]` and gets 404; B's POST with A's id gets 404, verifies **AC-7**
- History injection: a request carrying extra assistant messages is ignored; only the new user message is saved, verifies **AC-2**
- Limits: 4,001 characters gives a notice and no AI call; the 41st message in a run gives a notice, verifies **AC-8**
- Decline and short balance: decline holds nothing; balance 0 shows the short card with guest text, verifies **AC-3**, **AC-10**
- Failure: the fake model errors and the try again card shows; the report fails and the retry card shows, verifies **AC-11**

## Build plan

Tracer Bullet: one guest gets from the first message to a ready report on the fake model first, then real AI, refresh and resume, credit UI, and limits.

1. [x] Chat screen on `/` and `/c/[id]` from the spec 0003 shell (Cache Components: static shell, session and `conversations.open` in Suspense, `notFound()` for other owners), satisfies **AC-1**, **AC-5**, **AC-7**
2. [x] Auth pieces: `/api/auth/[...all]` with BotID on anonymous sign in, `src/auth/client.ts`; then `POST /api/chat` with BotID, session, Zod, `conversations.turnContext`, `handleTurn` (saving the user message inside the lock, and returning `usage` and `release`), the `createUIMessageStream` wrapper with a single `onFinish` writer that saves, releases the lock, then records usage, plus `fake-model.ts`; tests that a repeated tap before the save gets `busy`, and that a response cancelled partway still frees the lock and saves the reply; integration tests, satisfies **AC-1**, **AC-2**, **AC-7**
3. [x] `chat.tsx`: `useChat`, the session loading state, the first send guard and anonymous sign in, URL replace after headers, the transport's error mapping and `401` retry, and every part renderer, wired to the report panel (spec 0005), satisfies **AC-1**, **AC-3**, **AC-4**, **AC-11**
4. [x] Credit UI: confirm card with `availableBalance`, short balance card (guest text), stop card, the client chip and `summary` on the approval, stop and report status results, satisfies **AC-3**, **AC-9**, **AC-10**
5. [x] Resumable streams: `resumable-stream` on Upstash with `after()`, the 5 minute key, and the GET resume route, satisfies **AC-6**
6. [x] Limits: env values, the typed only count, notices as `data-error` streams, satisfies **AC-8**
7. Playwright full flow plus axe, and a real model run with `/check verify`, satisfies **AC-12**, **AC-4**

## Consequences

**Positive**:
- The first real end to end thread exists: every layer from the screen to the database to Claude is proven together.
- Later tools (Beacon, Luna) reuse the whole thread unchanged.
- Server only saving and owner scoped reads keep history trustworthy.

**Negative / tradeoffs**:
- Until #21 and the paid chat milestone, guests can spend AI money with no rate limit or cap, so the app must not be linked publicly.
- `resumable-stream` adds a Redis dependency to every AI reply.
- The fake model script must be kept in step with the assistant's tool flow, or the e2e test drifts from reality.
- The turn lock is held until the reply is saved, a little longer than the stream itself, and its expiry grows to 120 seconds. After a crash, the next message waits up to that long for the `busy` notice to clear.

**Neutral**:
- `/c/[id]` URLs are ready for history (#14).
- Chat metering is logged (`metered`) but not charged until the credits milestone.

## Follow-up

- [ ] Credits paid chat milestone (spec 0004): use `metered` from `handleTurn` to charge typed messages.
- [ ] #21: rate limits per guest and per IP, the daily spend cap (filling `checkSpendCap`), BotID on guest start confirmed in production.
- [ ] #8: add the sign up button to the guest short balance card.
- [ ] Tick credits milestone 1 ("Thin thread") on the scope when this ships, since #7 builds its UI.
- [ ] A typed message sent again with the same id after its reply is saved runs a second AI turn (`messages.append` updates the user row in place). Card and approval taps are safe (the card or approval is already answered). If real traffic shows these resends, have `messages.append` report whether the row was new and answer a resend without an AI call.
