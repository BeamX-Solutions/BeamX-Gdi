# 0008. Abuse and AI cost guards

**Date**: 2026-11-22
**Status**: In Progress

## Summary

Guests can chat and start tool runs for free, and every message is a paid AI call, so this feature puts a ceiling on both before any public link goes out. It adds a daily AI spend cap ($20 by default), daily limits per guest and per IP (internet address) on runs, typed messages, new chats and new guests, and a short burst limit on the chat. Every limit lives in Upstash Redis, comes from env, resets at Lagos midnight, and shows a friendly notice instead of an AI call. Signed in users (after #8) only meet the burst limit.

## Requirements

**User stories**:
- As the BeamX team, I want guest AI spend to stop at a daily ceiling so that a script or a bad day can never run up the Anthropic bill.
- As a guest, I want a clear, friendly message when I hit a limit so that I know to come back tomorrow, not that the app broke.
- As the BeamX team, I want every limit in config so that I can loosen or tighten one without a deploy.

**Acceptance criteria**:
- **AC-1**: Every AI call (chat turns, the known facts extraction, every report phase and its repair call) adds its `costUsd` to a Redis total for the current Lagos day, at the same place its `ai_usage` row is recorded. Calls with no usage add nothing.
- **AC-2**: Once the day's total reaches `AI_DAILY_SPEND_CAP_USD` (default 20), a guest's typed message gets a friendly "come back tomorrow" notice with no AI call and nothing saved, and a guest's Approve that would start or restart a run gets the same notice with no hold and no run started (the Approve tap itself is saved, like every approval). Card answers inside a run already started, approval taps that only continue a started run, and reports already claimed still go through. Signed in (not anonymous) users are never paused by the cap.
- **AC-3**: The first time the cap trips on a Lagos day, `spend_cap_tripped` is logged once and `spend:tripped:<lagosDate>` is set to the time (kept 7 days).
- **AC-4**: A guest's Approve that would start their 4th run of the Lagos day (`LIMIT_RUNS_PER_GUEST`, default 3), or the 21st from their IP (`LIMIT_RUNS_PER_IP`, default 20), is refused with a friendly notice, no hold and no run started. Only runs that actually start count; a restart counts as a new run, a resume does not.
- **AC-5**: A guest's typed message sent with no run in progress in that chat, past `LIMIT_CHAT_PER_GUEST` (default 30) in the Lagos day, gets a friendly notice, with no AI call and nothing saved. Only accepted messages count; taps, and messages during a run in progress, never count.
- **AC-6**: A guest's message that would create their 21st new chat of the Lagos day (`LIMIT_CHATS_PER_GUEST`, default 20) gets a friendly notice, and no conversation row is created. Messages to a chat that already exists are never refused by this limit.
- **AC-7**: `POST /api/chat` from one user more than `LIMIT_BURST_PER_USER` times a minute (default 10), or from one IP more than `LIMIT_BURST_PER_IP` times a minute (default 60), gets a friendly "slow down" notice with no AI call and nothing saved. This applies to guests and signed in users alike.
- **AC-8**: `POST /api/auth/sign-in/anonymous` from an IP that already created `LIMIT_GUESTS_PER_IP` guests (default 30) that Lagos day returns `429 {"code":"guest_limit"}`, no guest is created, and the client shows a friendly card.
- **AC-9**: When Upstash is unreachable or a limit check throws, the request goes through and `limit_check_failed` is logged with the limit name. No limit ever turns into a 500.
- **AC-10**: Every limit number and the cap come from env through `src/lib/env.ts`, with the defaults above, and are listed in `.env.example`. All daily counters reset at midnight `Africa/Lagos`.
- **AC-11**: A report already claimed never fails because of the cap: the report runner's spend check no longer blocks a phase (this changes spec 0005, AC-12).

## Decision

**Chosen option**: Option 1: Redis counters per Lagos day, checked at the three entry points (chat route, run approval, guest sign in)

All guards are Upstash Redis counters, `@upstash/ratelimit` sliding windows for the per minute burst limits and plain `INCR` keys per Lagos date for the daily limits and the spend total, checked where the request enters and failing open when Redis is down.

**Implementation skills**: `upstash-ratelimit-js` (`upstash/skills`, `.claude/skills/upstash-ratelimit-js/`) · `upstash-redis-js` (`upstash/skills`, `.claude/skills/upstash-redis-js/`)

## Feature design

**Data model sketch** (Redis only; nothing new in Postgres, `ai_usage` stays the full cost record):

| Key | Type, expiry | Counts | Limit (env) |
|---|---|---|---|
| `limit:burst:user:<userId>` | `@upstash/ratelimit` sliding window, 1 minute | every `POST /api/chat` | `LIMIT_BURST_PER_USER` = 10 |
| `limit:burst:ip:<ip>` | sliding window, 1 minute | every `POST /api/chat` | `LIMIT_BURST_PER_IP` = 60 |
| `limit:chat:<userId>:<lagosDate>` | `INCR`, 48h | guest typed messages with no run in progress, once accepted | `LIMIT_CHAT_PER_GUEST` = 30 |
| `limit:chats:<userId>:<lagosDate>` | `INCR`, 48h | new chats actually created by a guest | `LIMIT_CHATS_PER_GUEST` = 20 |
| `limit:runs:user:<userId>:<lagosDate>` | `INCR`, 48h | guest runs actually started (restart counts) | `LIMIT_RUNS_PER_GUEST` = 3 |
| `limit:runs:ip:<ip>:<lagosDate>` | `INCR`, 48h | guest runs started from that IP | `LIMIT_RUNS_PER_IP` = 20 |
| `limit:guests:<ip>:<lagosDate>` | `INCR`, 48h | guest sign ins from that IP | `LIMIT_GUESTS_PER_IP` = 30 |
| `spend:<lagosDate>` | `INCRBYFLOAT`, 48h | dollars of every AI call | `AI_DAILY_SPEND_CAP_USD` = 20 |
| `spend:tripped:<lagosDate>` | `SET NX`, 7 days | the time the cap first tripped | marker only |

Daily keys for chats, chat messages and guests are "check, then count on success": the check reads the counter (`GET`), and the counter goes up only after the thing it counts happened. Parallel requests from different chats can all pass at the edge (the turn lock is per chat), so the overshoot is bounded by how many requests run at once; that is accepted for these cheap limits, the same trade #22 made for the free allowance.

The run counters are atomic instead, because an extra run costs credits and AI spend: inside the tool, `INCR` both run keys first; if either new value is over its limit, or the run then fails to start (a failed hold, insufficient credits, a price change), `DECR` both. Every `INCR` sets its expiry in the same pipeline (`INCR` then `EXPIRE … NX`), so no key can outlive its 48 hours.

**Where each guard runs** (order matters: cheap and Redis only first, before the Frankfurt round trip):

1. `POST /api/chat` (`src/app/api/chat/route.ts` → `assistant/chat-api.ts`). The route reads `sessionUser(headers)` (`{ id, isAnonymous }`) and `clientIp(headers)` once at request start and passes `isGuest` and `ip` into `postChat`; the guest flag is fixed for the whole request, even if the guest links an account mid turn. Check order, first refusal wins:
   1. Burst (AC-7), user and IP windows in parallel, after BotID and the session but before the body is parsed.
   2. Body parse and `classifyMessage` as today.
   3. For guests, read the `limit:chats` count, then `turnContext` with `mayCreate` (below).
   4. The `answered` early return (a resent message that has a reply) as today.
   5. New chat refused (`chat_limit` from `turnContext`): the `chats_daily` notice (AC-6).
   6. Only for a guest's typed message (`turn.kind === "text"`) that is not a resend (`!message.saved`): the spend cap (AC-2), then the daily chat limit when no run is in progress (AC-5). Approval taps are never checked here: the route cannot tell whether an approval starts, resumes or stops a run, so the run guard lives in the tools (step 3 below).
   7. The existing text length and per run limits (spec 0007).
   8. After `handleTurn`: when the turn ran (`turn.ok` and `!busy`) and `metered` is true (a typed message with no run in progress, already computed by `handleTurn`), count the typed message (AC-5); when `turnContext` reported `created`, count the new chat (AC-6). A resend (`message.saved`) is never counted again.
2. New chats (AC-6): the route reads the guest's `limit:chats` counter before `turnContext` and passes `mayCreate = count < limit` (always true for signed in users). In the same `db.batch`, the insert becomes `INSERT … SELECT … WHERE <mayCreate> ON CONFLICT DO NOTHING RETURNING id`, so `created` is true only when this request made the row (false on a conflict or when not allowed). If the owner read then finds no row (a new id with `mayCreate` false), `turnContext` returns `err({ code: "chat_limit" })`; an existing chat returns its context as today, whatever `mayCreate` is. One DB round trip is kept.
3. Run approval (AC-2, AC-4): the guest flag and IP travel `postChat` → `handleTurn` input `context` (new `isGuest` and `ip` fields on `TurnInput.context`) → `AiTurnContext` → `ToolEnv` (new `isGuest` and `ip` fields), and the tools get a `limits` dependency on `AssistantToolDeps` (`guestSpendCap`, `takeRun`, `giveBackRun`). In the `startRun` tool, and in `restartRun` only on its new run path (`startFromWithHold`), for guests and before the hold: the spend cap, then `takeRun(userId, ip)` (the atomic `INCR` above). Over a limit, the tool returns a new `StartRunOutput` error, `run_limit` or `spend_cap`, and holds nothing; if the hold then fails, `giveBackRun` undoes the count. `restartRun`'s resume path (`resumeRunWithHold`) and `resumeRun` are never limited or counted.
   - Delivery: `ai-turn.ts`, which already reads the tool events after the stream, appends a `data-error` part (`runs_daily` or `spend_cap`) when a money tool returned one of these errors, the same way it appends other cards. The instructions tell the model these two errors are shown by a card, so it replies with at most one short line. This reply is saved like any tool result; the card is live while it is the last message and drops out as the chat moves on.
4. Guest sign in (AC-8): in `src/app/api/auth/[...all]/route.ts`, after BotID, the IP counter is checked; over it returns `429 {"code":"guest_limit"}`. It is counted only when Better Auth's response is `200`. A guest with a session never calls this route (the client signs in only when there is no session, spec 0007). In the chat client, `authClient.signIn.anonymous()` returns `{ error }` with status 429, which `send()` maps to a new `guest_limit` failure card beside the existing `sign_in` card.
5. Spend total (AC-1, AC-3): `usage.record` is wrapped once (`withSpend`) where the deps are composed (`chat-deps.ts`, `turn-deps.ts`, `report-deps.ts`): every AI path (chat turn, extraction, report phases and repairs) records usage through one of these. The wrapper records the `ai_usage` row as today and, only if that insert succeeded, adds `costUsd` with `INCRBYFLOAT`. When the returned total is at or over the cap it sets the tripped marker with `SET NX` and logs `spend_cap_tripped` only if that `SET` succeeded. Chat usage is recorded in `waitUntil` after the reply, so the cap can lag by the turns already in flight; accepted.
6. Report runner (AC-11): the runner keeps calling its existing hook with its existing signature, `checkSpendCap(userId)`, which now always allows (no contract churn). The guest check is a separate function, `guestSpendCap()`, used only at chat and at Approve, where no credits are held yet.

**New modules** (`src/lib/`, shared server helpers, no DB):

- `client-ip.ts`: `clientIp(headers)`, the first address in `x-forwarded-for` (Vercel sets and overwrites it), else `x-real-ip`, else `null`. With `null`, IP limits are skipped (never one shared bucket) and, on a Vercel deploy, `client_ip_missing` is logged. Also the helper spec 0004 expects for the guest grant IP cap.
- `limits.ts`: the limit policy, pure (`limitConfig` from env, `lagosDate(now)` using `billing/pricing.ts` `localDate` with `Africa/Lagos`, key builders, `overLimit(count, max)`), plus the Redis side (`readCount`, `countOnce`, `burstCheck` with `@upstash/ratelimit`), every call wrapped so a throw logs `limit_check_failed` and allows (AC-9).
- `spend-cap.ts`: keeps `checkSpendCap(userId)` for the report runner (always allows); adds `guestSpendCap()`, which reads `spend:<lagosDate>` and refuses at or over the cap, and `addSpend(costUsd)` for `withSpend`.

**Friendly notices** (chat notices are `data-error` parts, shown, never saved, like spec 0007's limit notices; new `errorKinds` with copy in `error-copy.ts`):

| Kind | Title | Message | Action |
|---|---|---|---|
| `slow_down` | "You're sending messages fast" | "Wait a few seconds, then send again." | Got it (puts the text back, like spec 0007) |
| `chat_daily` | "You've reached today's chat limit" | "Come back tomorrow to keep chatting, or start a tool run." | Got it |
| `chats_daily` | "You've started a lot of chats today" | "Carry on in one of your chats, or come back tomorrow." | Got it |
| `runs_daily` | "You've used today's free runs" | "Come back tomorrow to start another." | Got it |
| `spend_cap` | (existing `errorCopy.spend_cap`) | (existing) | Got it |
| `guest_limit` (client failure card) | "We couldn't start a new chat" | "Too many new visitors from your network today. Please try again tomorrow." | Got it |

**API surface**:

| Endpoint | Method | Change | New outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/chat` | POST | burst, daily chat, new chat, guest spend cap | notice streams `slow_down`, `chat_daily`, `chats_daily`, `spend_cap` | session | none new (notices are 200 streams) |
| `/api/auth/sign-in/anonymous` | POST | guest per IP cap | `429 {"code":"guest_limit"}` | none | 429 |
| `startRun`, `restartRun` tools | (assistant tools) | guest run limits, guest spend cap | tool errors `run_limit`, `spend_cap` | session owner | none |
| report runner | (internal) | spend check no longer blocks | none | none | none |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| any guard | Lagos date | `lagosDate(new Date())` = `localDate(now, "Africa/Lagos")` (`billing/pricing.ts`) |
| any guard | guest or account | Better Auth session `user.isAnonymous`; `sessionUserId` grows a sibling `sessionUser(headers)` returning `{ id, isAnonymous }` |
| IP limits | client IP | `clientIp(request.headers)` (`x-forwarded-for` first entry) |
| tool limits | guest flag, IP | read once in the route; `postChat` input → `TurnInput.context` → `AiTurnContext` → `ToolEnv` (`isGuest`, `ip`) |
| AC-1 | cost of a call | the `costUsd` already computed for the `ai_usage` row (`src/lib/ai-cost.ts`) |
| AC-2 | today's spend | `spend:<lagosDate>` |
| AC-2, AC-5 | "a run in progress" | `turnContext().active.active?.run.status === "in_progress"` (already read) |
| AC-2 | "Approve that starts a run" | the approval resolves to `startRun` or `restartRun` (checked inside those tools) |
| AC-5 | "typed message" | `classifyMessage` turn kind `text` (spec 0007) |
| AC-5 | message accepted, no run in progress | `handleTurn` output `metered` true, with `turn.ok` and `!busy` |
| AC-2, AC-5 | resend, never checked or counted again | `turnContext` `message.saved` (spec 0007 review fix) |
| AC-8 | sign in succeeded | Better Auth response status `200` |
| AC-6 | chat is new | `turnContext` `created` (the conditional insert returned a row) |
| AC-6 | may create | `limit:chats` count < `LIMIT_CHATS_PER_GUEST`, read by the route before `turnContext` |
| every limit | the numbers | `env.ts` (AC-10) |

**Key invariants**:
- A refused chat message makes no AI call, saves no message and creates no chat row; a refused Approve holds no credits and starts no run.
- A counter counts only what happened: check then count for chats, messages and guests; take then give back for runs.
- Signed in users meet only the burst limits; every daily limit and the spend pause are guest only.
- No limit check can fail a request: Redis errors allow and log (AC-9).

**Security model**: limits are keyed by the session user id and the client IP; nothing a client sends in the body changes a key. IPs are stored only as Redis key parts with a 48 hour expiry (they are personal data under NDPA and GDPR; feature #18's privacy notice lists rate limiting by IP). `x-forwarded-for` is trusted only because Vercel overwrites it; off Vercel the IP may be missing, and then IP limits are skipped rather than sharing one bucket.

**Configuration required**:
- `AI_DAILY_SPEND_CAP_USD` (default 20)
- `LIMIT_BURST_PER_USER` (10), `LIMIT_BURST_PER_IP` (60)
- `LIMIT_CHAT_PER_GUEST` (30), `LIMIT_CHATS_PER_GUEST` (20)
- `LIMIT_RUNS_PER_GUEST` (3), `LIMIT_RUNS_PER_IP` (20)
- `LIMIT_GUESTS_PER_IP` (30)
- Uses the existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; without them (dev, CI) every limit allows, like the turn lock.
- New dependency: `@upstash/ratelimit`.

**Critical test scenarios**:
- Spend total: three recorded calls add up in `spend:<date>`; a call with no usage adds nothing; crossing the cap sets the marker and logs once even with two parallel crossings, verifies **AC-1**, **AC-3**
- Cap tripped: a guest's typed message and a guest's run starting Approve get `spend_cap`; a card answer in a started run and a signed in user's message go through; a claimed report runs all phases, verifies **AC-2**, **AC-11**
- Run limits: the 4th guest Approve of the day gets the `runs_daily` card with nothing held; a failed hold gives the count back; two parallel Approves at the limit start only one run; a resume, and a restart that resumes, are not counted; a restart that starts a new run is, verifies **AC-4**
- Daily chat: the 31st typed message with no run is refused; messages during a run in progress, taps, busy turns and resends never count, verifies **AC-5**
- New chats: the 21st fresh id gets `chats_daily` and no row; a message to an existing chat passes, verifies **AC-6**
- Burst: the 11th POST in a minute from one user gets `slow_down`; a signed in user is limited too, verifies **AC-7**
- Guests per IP: the 31st anonymous sign in from one IP gets `429 guest_limit` and no user row, verifies **AC-8**
- Redis down: every guard allows and logs `limit_check_failed`; no 500, verifies **AC-9**
- Config: env overrides change each limit; the Lagos day boundary rolls the keys at 23:00 UTC, verifies **AC-10**

## Build plan

Tracer Bullet: one guard end to end through every layer first (the spend total and the guest cap at chat), then the rest one strand at a time.

1. [x] `client-ip.ts`, `limits.ts` (config, Lagos date, keys, fail open wrappers), env vars and `.env.example`, `@upstash/ratelimit`; unit tests with a fake Redis, satisfies **AC-9**, **AC-10**
2. [x] Spend total: `withSpend` around `usage.record` in the three deps files, `addSpend`, the tripped marker and log; tests, satisfies **AC-1**, **AC-3**
3. [x] Guest spend cap at chat: `sessionUser` (`isAnonymous`), `checkSpendCap` filled in, the `spend_cap` notice in `chat-api.ts` for typed messages; the report path's hook always allows; tests, satisfies **AC-2** (chat), **AC-11**
4. [x] Run approval: `isGuest` and `ip` through `TurnInput.context`, `AiTurnContext` and `ToolEnv`; the `limits` tool dependency; guest spend cap and atomic run counters in `startRun` and `restartRun`'s new run path; the `run_limit` and `spend_cap` outputs turned into cards in `ai-turn.ts`, with the one line instruction; tests, satisfies **AC-2** (Approve), **AC-4**
5. [x] Chat route limits: burst windows first, daily chat check and count, `mayCreate` and `created` in `turnContext` (integration test) with the `chats_daily` notice; the new notice kinds and copy; tests, satisfies **AC-5**, **AC-6**, **AC-7**
6. Guest sign in IP cap in the auth route, counted on `200`, with the `guest_limit` card in the chat client's `send()`; tests, satisfies **AC-8**
7. `/design` showcase for the new notices, and an e2e check that a limit notice renders with axe clean (limits set to 1 through env in the test server), satisfies **AC-2**, **AC-5**, **AC-7**

## Consequences

**Positive**:
- Guest AI spend has a hard daily ceiling, with the Anthropic console's monthly limit as the backstop.
- Every limit is one env change away, with no deploy needed on Vercel beyond a redeploy for env.
- #22 reuses `clientIp` and the Lagos keys, so all daily limits reset together.

**Negative / tradeoffs**:
- The chat, chat count and guest counters can overshoot under parallel requests (check, then count); run counters cannot.
- Signed in users' spend is bounded only by the Anthropic console's monthly limit (they are never paused, by design).
- Failing open means an Upstash outage removes the guards for its duration; spend is still bounded by the console limit.
- Users behind one carrier IP share the IP limits; the defaults are loose to soften that.
- `spend:<date>` can drift a little from the `ai_usage` sum (a Redis write can fail after the row is saved); `ai_usage` stays the truth for billing and audits.
- Two more Redis round trips on a chat turn (the burst windows run in parallel; the daily reads run in parallel), each a few milliseconds from Vercel `fra1` to Upstash `eu-central-1`.

**Neutral**:
- Spec 0005, AC-12 changes: the runner's spend check no longer blocks report phases (AC-11).
- Spec 0001's runtime rule changes: the spend pause now covers guest chat too, and days are Lagos days.
- #22's daily free chat allowance (5 a day, then paid) later replaces the 30 a day guest chat cap (AC-5).

## Follow-up

- [ ] Update spec 0005, AC-12 and spec 0001's spend cap rule to match this spec (`/architect`), and `src/lib/AGENTS.md`'s spend cap line (UTC day, guest runs only) via `/sync` once built.
- [ ] Add rate limiting by IP to feature #18's privacy notice processor and purpose list.
- [ ] When #22's free allowance lands, drop `LIMIT_CHAT_PER_GUEST` in favour of it.
- [ ] Add real alerting on `spend_cap_tripped` when error monitoring arrives (spec 0001 follow-up).

## Rationale

Reasoning and options considered: see [rationale.md](rationale.md).
