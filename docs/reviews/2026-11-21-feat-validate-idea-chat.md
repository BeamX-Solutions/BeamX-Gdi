# Review, feat/validate-idea-chat, 2026-11-21

**Reviewed by**: Claude Sonnet 5.5 (fresh reviewer context; author on the same model family)
**Scope**: about 99 files (5.8k added lines), branch vs main
**Verdict**: Blocked

## Summary
The branch wires the full chat thread: BotID, guest sign in, `POST /api/chat` with a single writer per turn, resumable streams on Upstash, the chat client, credit cards and chip. The server side (`chat-api.ts`, `turn.ts`, `turnContext` as one batch) is careful and well tested. One production blocker: the "New chat" button still points at the design only demo route and 404s for real users. One major: "Send again" can run a second AI turn and save a duplicate reply. BotID wiring looks correct in code; the AC-7 miss is most likely project or request configuration (see Minor).

## Blockers
### 🔴 "New chat" links to a design only page, `src/components/workspace/history-rail.tsx:71`
**Problem**: `HistoryRail` renders `<Link href="/design/shell">` for "New chat". `HistoryRail` is now mounted by the real chat (`chat.tsx:80`), and `src/app/design/shell/page.tsx` calls `notFound()` unless `ENABLE_DESIGN_PAGE` is set (off in Production per `.env.example`). The other `/design/shell` hrefs are in `fixtures/shell.ts` (fixture data only, fine).
**Why it matters**: every production user who taps "New chat" gets a 404. Even with the flag on it would open the fixture shell, not a chat. No test covers the button, so nothing catches it.
**Suggested fix**: point it at `/` (make the href a prop so the demo shell keeps its own). Confirm the new chat really starts empty: `Chat` keeps the fresh id in a `useRef` (`chat.tsx:107-114`) and the URL was moved to `/c/<id>` with `replaceState`, so going to `/` from `/c/<id>` should remount, but verify no stale `useChat` state survives. Add a Playwright step: send, tap New chat, assert starter prompts and a new id.

## Major
### 🟠 "Send again" can run a second AI turn and save a duplicate reply, `src/components/workspace/chat.tsx:283` (server: `src/assistant/turn.ts:382`, `src/db/queries/messages.ts:109`)
**Problem**: `retryTurn` calls `regenerate()`, which in the AI SDK drops the last assistant message of the client thread and resends the last user message. Two weaknesses combine:
1. Client: the "last assistant message" is not guaranteed to be the busy notice. If the original turn's reply reaches the client after the notice (stream resume, a second tab, a reload while the first turn finishes), `regenerate()` throws away the real reply and re-asks for the same user message. That matches the observed 2 user, 3 assistant result (my reading from the code; not reproduced).
2. Server: the lock is taken before the save (right for busy), but nothing dedupes a user message id that already has a reply. `append` upserts (`ON CONFLICT (id) DO UPDATE`, returns 1 row), so a resend of an answered message passes, runs the AI again and saves a second assistant message under a new `assistantId`.
**Why it matters**: duplicated replies in history (the model then sees both), double token spend, and double metering once chat is paid (`metered`).
**Suggested fix**: client, make the busy retry target the refused user message explicitly: remove the busy notice by id, then resend that user message (`regenerate({ messageId })` for the user message, or `sendMessage` with its parts and a new id). Server, treat an incoming user message id that already exists and is followed by a saved assistant message as already answered: return the saved reply or a no op notice instead of a new AI turn. Add a `turn.test.ts` case for the resend and a flow test for busy then Send again.

## Minor
### 🟡 AC-7 BotID did not fire on the preview: no wiring mistake found, `src/lib/bot-check.ts:10`
**Assessment**: wiring matches the `botid` 1.5.13 README: `withBotId(nextConfig)` in `next.config.ts`, `initBotId` in `src/instrumentation-client.ts` (under `src/`, so Next picks it up) listing `POST /api/chat` and `POST /api/auth/sign-in/anonymous`, `checkBotId` called first in both routes, dev bypass gated on `VERCEL !== "1"`. The library asks Vercel's classification service, so a human verdict for a script means one of: (a) BotID is not enabled for the project (Vercel dashboard, Firewall, Bot Management; a project toggle, not code), (b) the scripted request carried the Deployment Protection bypass header or cookie, which Vercel treats as already verified (`bypassed`), or (c) Basic mode did not flag that client. Check the function log for the library's "Possible misconfiguration of Vercel BotId" line: if present, the call reached the service without a challenge header and got "human", which points to (a) or (b), not code.
**Code issue found here**: `isBot()` has no try/catch. `checkBotId` throws when the OIDC token is missing or the Vercel API call fails, so the route would return an unhandled 500, against the "never a 500" rule. Decide fail open or fail closed explicitly and return the typed `{ code: "bot" }` or a friendly error. The route order (BotID, session, body) has no unit test.
**Suggested fix**: confirm the dashboard toggle, retest with plain `curl` and no bypass header, then add the try/catch.

### 🟡 Retrying a typed message at the per run limit is refused, `src/assistant/chat-api.ts:240`
`typedInRun` counts saved typed rows, including the message being retried (it is saved before the AI runs). Retrying the 40th typed message after an AI error counts it twice and returns `limit_run`. Exclude the incoming message id from the count, or skip the limit when that id is already saved.

### 🟡 Report route `maxDuration` cut from 800 to 300, `src/app/api/runs/[runId]/report/route.ts:18`
Documented as a Hobby limit, but AGENTS.md and spec 0001 say Vercel Pro. Luna's five phase report will be cut off inside `after()`. Record it in the spec as a known gap or gate Luna until Pro.

### 🟡 A 401 retry in the transport signs in a new guest, `src/components/workspace/chat.tsx:200`
On an expired session the wrapper creates a new anonymous user and retries. The chat id belongs to the old guest, so the retry returns `404 not_found` and the old chat is orphaned. Rare, but the user loses the thread. Prefer the sign in card on 401 for a saved chat.

### 🟡 `turnContext` creates the conversation before limits and busy are checked, `src/db/queries/conversations.ts:77`
Any authenticated POST with a fresh uuid inserts a `conversation` row, even for a limit notice. Fine for the one round trip goal, but a guest can create empty chats without bound until #21 adds rate limits. Add to the #21 list.

### 🟡 "Got it" on a limit notice discards the typed text, `src/components/workspace/chat-view.ts:441`
`withoutMessageOf` drops the refused user message (right for the open card), but a long text the user typed is gone. Return it to the composer on dismiss.

## Nits
- ⚪ `src/db/queries/runs.ts:456`, two stacked JSDoc blocks; the first ("The chat's active run...") is a leftover above `activeStatements`.
- ⚪ `src/components/workspace/chat-view.ts:437`, the `withoutMessageOf` comment has a ragged first line; rewrap.
- ⚪ `src/lib/resumable.ts:44`, `decode` re-stringifies non string messages and returns raw text on a parse miss; both unreachable given `encode` on the publisher side. Simplify or comment why.
- ⚪ `src/auth/auth.ts:12`, `VERCEL_BRANCH_URL` is also set on production deploys, so the main branch alias becomes a trusted origin there. Harmless, but gate on `VERCEL_ENV === "preview"` if you want it tight.

## Review of the four late fixes
- `32e1344` (sign in network catch, `chat.tsx:247`): correct. `.catch` maps a thrown request to the same card, `setSigningIn(false)` runs before the early return, `finally` resets `inFlight`. Covered by `e2e/sign-in-failure.spec.ts`.
- `0f616e6` (JSON encoded pub/sub, `resumable.ts:44`): sound reasoning (SSE chunks contain newlines); `resumable.test.ts` exists. See the nit on `decode`.
- `c2489a8` (`trustedOrigins`, `auth.ts:12`, `env.ts`): correct, read through `env.ts`, listed in `.env.example`. See the nit.
- `b49f940` (`withoutMessageOf`, `chat-view.ts:441`): correct for limit notices (only typed text is limited, so the preceding user message is the refused one) and tested. Keep it limited to limit notices; dropping a saved user message elsewhere would desync client and DB. See the minor on lost text.

## Strengths
- One writer per turn: reply saved in the outer stream's `onEnd`, then the lock is released, with a `once` guarded release and cancel/abort paths; busy writes nothing.
- `turnContext` folds create, owner check, active runs and typed count into one `db.batch`, honoring the Frankfurt latency rule.
- The fake model is gated by deploy kind (`fakeAiEnabled`, boot refusal in production), so the full flow e2e costs nothing.
- Typed results and friendly cards on expected failures; `chat-api.test.ts`, `chat-view.test.ts`, `resumable.test.ts` and the e2e flows are substantive.

## Test coverage
Configured (Vitest beside source, Playwright). Covered: `chat-api` (busy, cancel, limits), `chat-request`, `chat-view`, `resumable`, credit copy, turn context (integration), flow and sign in failure e2e. Gaps: no test for the "New chat" button (the blocker), none for busy then Send again against a finished turn or a resent already answered message id, none for `isBot` failure behavior or route ordering.
