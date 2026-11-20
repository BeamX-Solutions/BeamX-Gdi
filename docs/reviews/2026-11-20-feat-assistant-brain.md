# Review, feat/assistant-brain, 2026-11-20

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 57 files (lock file excluded), branch vs main
**Verdict**: Changes requested

## Summary
This adds `handleTurn` and the assistant brain from spec 0006: the card path, the AI turn with approval-gated money tools, known-facts extraction, the Redis turn lock, `credits.startFromWithHold` and `credits.runQuote`, plus an eval harness. The structure follows the spec. Money safety is mostly server-side: shown prices and held amounts are always overwritten by the refinement, and holds go through single `billing_assert` batches. The headline issues are a contract gap with spec 0007 (chat usage can never be recorded), an idempotency and forgery hole around the client-chosen message id, and a turn lock that can turn a Redis blip into a 500.

## Major
### 🟠 Chat usage cannot reach `ai_usage`, `src/assistant/ai-turn.ts:480-565`, `src/assistant/turn.ts:128`
**Problem**: Spec 0006 (line 181) and spec 0007 AC-2 say #7's `onFinish` writes the `ai_usage` row for AI turns (`callKey <messageId>:chat`). But `createAiTurn` consumes `streamText` itself, calls `toUIMessageStream` with `sendFinish: false` and no `messageMetadata`, and `TurnOutput` is just `{ stream, metered }`. Nothing carries `result.usage` or the model id out. Only extraction records usage (`extract.ts`).
**Why it matters**: Every chat turn (the expensive Opus call) would go unrecorded, so cost data and the future daily spend cap (#21) undercount. Spec 0007 cannot meet its own AC-2 with this interface.
**Suggested fix**: Either record the chat usage inside the AI turn after the stream (a `recordUsage` dep is already wired; the `callKey` needs the assistant message id the route generates, so pass it in the context), or expose usage on `TurnOutput` (for example a promise resolving to usage and model id) and update spec 0006/0007 to match. Add a test for whichever is chosen.

### 🟠 User message id is an upsert key, so assistant history can be overwritten and approval replays are not idempotent, `src/db/queries/messages.ts:109`, `src/assistant/turn.ts:384-394`
**Problem**: `handleTurn` saves the client's `message.id` through `messages.append`, which is `ON CONFLICT (id) DO UPDATE SET parts = ...` guarded only by `conversation_id` equality, not by role. A client can send a user message whose uuid equals an existing assistant message in its own chat and replace that message's parts. That breaks the documented invariant "values always come from the server written card" (`decidePrefill` reads `latestPrefill` from history; `latestShownQuestion`, `pendingApprovals` and the tool outputs the model trusts all come from stored assistant parts). Separately, an approval tap re-sent with the same message id before #7 has saved the assistant message (the lock is freed when the stream ends, the save is in `onFinish`) passes `pendingApprovals` again and runs `startRun` a second time: a second run, pausing the first, and a second hold.
**Why it matters**: Self-inflicted only (everything is owner scoped, prices are re-derived), so it is not a theft path, but it lets a client forge history the server treats as authoritative and allows duplicate credit holds on a network retry. The spec says the save is "idempotent on the client message id", which is right for retries but not for overwriting other roles.
**Suggested fix**: For user messages, insert with `ON CONFLICT DO NOTHING` (or only update when the existing row has role `user`), and have `handleTurn` treat a duplicate user message id as a replay: do not re-run an approval whose message already exists (return the busy or already-handled reply). Add a test with a forged assistant message id and an approval replay.

### 🟠 Turn lock acquire can throw and fail open silently, `src/lib/turn-lock.ts:32-38,56-65`, `src/assistant/turn.ts:377`
**Problem**: `redis.set` in `acquire` is not wrapped, and the call at `turn.ts:377` sits outside the `try`. A Redis timeout or outage throws out of `handleTurn`, so the route returns a 500 with no card. `release` is protected; `acquire` is not. Also, in production a missing `UPSTASH_*` variable only logs `turn_lock_disabled` once and every turn proceeds unlocked, while `env.ts` marks both optional.
**Why it matters**: The project rule is that expected failures never become a 500 or blank screen. One Upstash blip takes the whole chat down. A silently disabled lock removes the only guard against concurrent turns on one chat (double run starts, racing answer saves).
**Suggested fix**: Catch errors in `acquire` and choose a deliberate policy (fail closed with a friendly retry card, or fail open with a logged event), and require the two variables when `NODE_ENV` is production (Zod refine in `env.ts`).

## Minor
### 🟡 Tool error text is streamed to the browser and saved, `src/assistant/ai-turn.ts:502-505,533`
**Problem**: `onError: toolErrorText` is used so the saved tool error equals what the model saw, but the same `tool-output-error` chunk is written to the client and persisted. `error.toString()` from a failed Drizzle or Neon call includes the SQL and parameters (answer text, ids).
**Why it matters**: Internals leak to the user and into stored message parts. Only the user's own data, hence minor.
**Suggested fix**: Keep the model-facing text, but send the client a generic message at the browser edge (the saved copy must still match the model's), or make tool `execute` bodies return typed `try_again` results instead of throwing.

### 🟡 Unbounded typed text in the user message schema, `src/assistant/parts.ts:200-203,224-228`
**Problem**: `textPart.text` has no max length; only the model view is cut to 4,000 (`cut`). Up to 20 parts of any size are stored, and extraction joins up to 30 messages of 4,000 characters each (about 120k characters) into one helper prompt.
**Why it matters**: Storage and cost amplification from one client, and a large helper call for a feature meant to be cheap.
**Suggested fix**: Cap text parts (for example 4,000 each, with a total per message) at validation, and cap the total extraction input.

### 🟡 Prefill saves are sequential and not atomic, `src/assistant/turn.ts:311-328`
**Problem**: Accepted items are saved in a `for` loop, one awaited DB round trip each. A failure on item N leaves 1..N-1 saved and replies "run isn't open any more".
**Why it matters**: Slower than needed (AGENTS.md: few, parallel DB calls) and a partially applied card. The next card still computes correctly from stored answers, so it is mild.
**Suggested fix**: Save in parallel with `Promise.all` or add a batch save query; treat a not-in-progress failure as a whole-card failure.

### 🟡 Sequential reads in `handleTurn`, `src/assistant/turn.ts:384-428`
**Problem**: The message append, then `getActive`, then (AI path) `openChat` in `createAiTurn`, then `getActive` again after the stream. The first two are independent of each other.
**Why it matters**: Each hop is a round trip on every typed turn.
**Suggested fix**: Run the append and the reads in parallel (the not-found result of the append still aborts), and pass `active` on to avoid re-reading where the turn had no tool events.

### 🟡 Turn lock TTL can expire mid turn, `src/lib/turn-lock.ts:28`, `src/assistant/ai-turn.ts`
**Problem**: The lock lives 60s. A turn is up to 5 model steps, tools, then extraction (8s timeout) and completion.
**Why it matters**: On a slow turn the lock lapses and a second turn can start on the same chat. The compare-and-delete release is correct, but nothing extends the lease. No unit test covers `redisTurnLock` (acquire NX, release only by token).
**Suggested fix**: Keep the TTL at least as long as the route's `maxDuration`, or renew it between steps; add a small test for the lock.

### 🟡 Extraction can propose weak free text answers, `src/assistant/extract.ts:190-196,322-331`
**Problem** (answers the session question): this is a prompt and validation issue, not a logic bug. `parseAnswer` only checks length for text questions, so "I want to sell zobo drinks to offices in Lekki" passes for a sentence shaped `value_creation` question. The prompt says "a short answer in the client's own words" without saying the text must read as a direct answer to that question's prompt.
**Why it matters**: The client still has to accept the card item, so nothing is saved silently, but a poor text answer on the card adds friction and could feed a report.
**Suggested fix**: Tell the extractor that a text answer is allowed only when the client's words directly answer that exact prompt (not a restatement of the business idea), and consider extracting only choice, scale and number questions at first. Add an eval case for it (the harness exists).

### 🟡 Prefill vs reply mismatch is a prompt gap, `src/assistant/instructions.ts:379-398`
**Problem**: After `startRun` returns ok, the instructions say "The app shows the next card after your reply", and the run state note (refreshed after the tool event) lists an open question. Nothing tells the model that facts from the chat may be offered first on a prefill card, so it says they will come up later.
**Why it matters**: The reply contradicts the card that follows. The code ordering is right (`startedParts` shows the prefill card first).
**Suggested fix**: Add one static line to the instructions: after a run starts, the app may first show a card with answers from earlier in the chat, so do not say the client will be asked those later.

### 🟡 Stream failure after a started run shows only the error card, `src/assistant/ai-turn.ts:536-556`
**Problem**: If the stream errors after `startRun` succeeded, `failed` is set and `partsAfterStream` is skipped, so the run and hold exist but no card appears.
**Why it matters**: The client sees "try again" and may ask for a second run; the next typed message recovers via the open card, but credits are already held.
**Suggested fix**: When a `started` event was recorded, still try `partsAfterStream` for the started run (or show the open card).

## Nits
- ⚪ `src/assistant/tools/run-questions.ts:430`, the `run_just_started` guard covers only runs started this turn. Leaving `resumeRun` out is correct, not a gap: a resumed run's card was already shown in the chat, so a same turn answer to it is a legitimate reply. A one line comment saying why would help the next reader.
- ⚪ `src/assistant/turn.ts:160-192`, `whenDone` has no test for cancel during `pull` or for double finish; consider one.
- ⚪ `test-preferences.json`, untracked at repo root; confirm it is meant to be committed.
- ⚪ `evals/assistant/results/*.json`, committed run output (about 1,800 lines); consider whether dated result files belong in git.
- ⚪ `src/assistant/ai-turn.ts:495`, `fallbacks: "default"` is an unexplained provider option; add a comment on what it does.

## Strengths
- Server written money fields: `shownPrice` and `heldAmount` are always overwritten by the refinement, approval is asked only when they are present, and `execute` re-checks `priceStillValid`. A model can never set its own price or skip the card.
- `startFromWithHold` composes the copy, pause and hold in one batch with `billing_assert`, and the destructuring indexes line up with the statement order; a failed hold rolls back the new run.
- Pure card-flow decisions (`decideAnswer`, `decidePrefill`, `openQuestion`) re-validate every id and value on the server, with Zod at every boundary and exhaustive `never` switches. Client text and answers are fenced as data in extraction and never put in the run state note.
- The same turn `saveAnswer` guard and the `asOwner` retry for a guest link landing mid turn are thought through and tested.

## Test coverage
Strong for the main logic: `ai-turn.test.ts` (about 1,480 lines, including extraction, the `run_just_started` guard and approvals), `turn.test.ts`, `parts.test.ts`, `card-flow.test.ts`, `run-state.test.ts`, integration tests for `startFromWithHold`, `runQuote` and the card path on a real branch, and grader tests for the evals. Gaps: no test for `redisTurnLock` or for `acquire` throwing; no test for forged or duplicate message ids; no test that a stream failure after a started run still leaves a usable card; the weak text extraction case is only addressed by prompt, not asserted. I did not run `pnpm test` or any eval or integration command.
