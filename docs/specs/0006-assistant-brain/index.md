# 0006. Assistant brain

**Date**: 2026-11-20
**Status**: In Progress

## Summary

The assistant brain is the part of `src/assistant/` that decides what happens on each chat turn. It picks the right BeamX tool from what the client says, asks for approval before spending credits, and walks the tool's questions as tap to answer cards. It also skips questions the chat already answered (after one confirmation), lets the client stop, change or resume a run by typing, and politely declines anything off topic. Card taps are handled by the server without calling the AI, so a 50 question tool costs no AI calls for its answers. The AI (Claude Opus 5.5) is used only when the client types. #7 then wires this brain into the chat route and the screen.

## Requirements

**User stories**:
- As a business owner, I want to say what I need in my own words and be offered the right BeamX tool, so I don't have to know the tool names.
- As a business owner, I want to answer by tapping cards, and not be asked again for what I already told the assistant, so a run is quick on my phone.
- As a business owner, I want to stop, change or continue a run just by saying so.
- As BeamX, I want the assistant to stay on BeamX topics and always steer towards a tool or a consultation, so AI spend serves the business.

**Acceptance criteria**:
- **AC-1**: `handleTurn(deps, { userId, conversationId, message })` is the one entry point #7's chat route calls. It returns `{ stream, metered, usage, release }` (the last two settled in spec 0007: the AI turn's token totals, and the function that frees the turn lock once the route has saved the reply). It first resolves the owner with `conversations.ownerOf(conversationId)` (a guest may have linked an account), or reuses the `context` (owner, active run) passed in by #7's route (spec 0007). It then takes a per conversation turn lock, and only then saves the user message (`messages.append`, idempotent on the client message id). A second turn while one is running returns a "one moment" notice, with no AI call and no write. A user message whose only part is a `data-answer`, `data-prefill-response` or `data-retry` part is handled deterministically (no AI call, `metered: false`). A message carrying only tool approval responses resumes the pending tool call (`metered: false`). Any other user message runs one AI turn, with `metered: true` unless a run was in progress at the start of the turn (spec 0004 AC-9).
- **AC-2**: The AI turn offers the tools `startRun`, `resumeRun`, `saveAnswer`, `showQuestion`, `stopRun` and `restartRun`. `startRun.toolId` is a Zod enum built from `toolIds`, and its description lists each tool's `name` and `whenToUse` from the registry (spec 0005). Adding a tool to the registry changes the assistant with no edit in `src/assistant/`.
- **AC-3**: `startRun`, `restartRun` and `stopRun` always need approval. `resumeRun` needs approval only when the run has no active hold. Approval uses AI SDK 7 `toolApproval`, with the server writing `shownPrice` from `creditPrice` through `experimental_refineToolInput` (spec 0004 AC-1, AC-2). For `resumeRun`, the refinement writes `shownPrice` only when the run has no active hold, and the approval follows from that input (see *Approval mechanics*). A price or hold that changed between the card and the tap makes the AI SDK turn the approval down ("does not match"), and `price_changed` does the same. Either way, the assistant calls the tool again, which shows a fresh card. `insufficient_credits` returns the short balance card (spec 0004 AC-8). Declining does nothing, and the assistant acknowledges it in one sentence.
- **AC-4**: Routing. For a message that clearly fits one tool, the assistant proposes that tool (a one line reason plus the approval card) in its first reply. When the message fits more than one tool, it asks exactly one clarifying question, then proposes. It never starts a run without the approval card. In the eval set, "I have a business idea" routes to `stellar`, and "how healthy is my business" routes to Beacon (once registered), with at least 90% of routing cases correct.
- **AC-5**: Known facts. After the stream of a turn in which `startRun` succeeded (never inside the tool call), one extraction call reads the conversation's client text and proposes answers by question id. It is skipped when that text is under 40 characters. Each answer is checked with `parseAnswer`, and visibility is worked out over the proposed set; invalid and hidden ones are dropped. If one or more remain, the server shows a `data-prefill` card listing them. Accept all saves them with `source = 'chat'`. Edit on an item shows that question's card. If none remain, or extraction fails or takes over 8 seconds, the first card shows directly. Nothing is saved from the chat without the client's confirmation. Extraction is never metered.
- **AC-5b**: When `restartRun` meets `version_changed`, it starts a fresh run of the same tool. The server reads the old run's answers (`runs.get`), checks each against the current module with `parseAnswer` and visibility, and offers the valid ones on the same `data-prefill` card (titled "From your last run"). Accepted answers keep the `source` they had in the old run.
- **AC-6**: Card flow. A `data-answer` submission is validated with `parseAnswer` and saved with `runs.saveAnswer` (`source = 'client'`). The reply is the next card from `nextQuestion`, worked out again over all answers with visibility, so an edit that reveals a question asks it and an edit that hides one ignores its answer. Each card carries `progress`. An answer for a run that is not active, an unknown or hidden question, or an invalid value shows the open card again with a short note, and changes nothing. A repeated tap for the same question is a harmless overwrite (history shows both bubbles). Only the latest `data-question` of the active run can be tapped; older cards render read only.
- **AC-6b**: The open card is the question of the latest `data-question` part for the active run, if that question is still visible. Otherwise it is `nextQuestion`.
- **AC-7**: Completion. When `nextQuestion` returns `null` after a save, the server runs `scoreRun` and `runs.complete` (spec 0005 AC-16). On `answers_changed`, it scores again once. If that fails too, it shows a `data-error` part (`kind: "complete_retry"`, "Something changed while saving. Tap to try again"), and tapping it sends a `data-retry` part that runs completion again. On success, it shows a `data-report` part (the view report card), which starts the report POST (spec 0005 AC-7). No AI call is needed to complete.
- **AC-8**: Typed answers. While a run is in progress and a card is open, a typed message that answers it makes the assistant call `saveAnswer` (`source = 'chat'`) with a value that passes `parseAnswer`. The server then shows the next card exactly as in AC-6. `saveAnswer` may target any visible question of the active run, checked on the server. A typed question or side remark gets a short reply, and the open card shows again. Every AI turn during an active run ends with the open card (AC-6b) shown again, except when the turn ends with an approval request pending, or with a tool call repeated after `price_changed` or a turned down approval. Then no question card is added.
- **AC-9**: Chat controls. "Stop" calls `stopRun` for an active or paused run. The approval card reads "Stop this run? Your N held credits will be returned" when `credits.runQuote` finds a hold (the server writes `heldAmount` into the input, like `shownPrice`), and just "Stop this run?" otherwise. On approval, `runs.abandon` releases any hold. A completed run returns `already_completed`, which the assistant explains. "Change my answer to X" during a run calls `showQuestion`, which reopens that card. After completion, it calls `restartRun` (a new run prefilled by `runs.startFrom`, new approval and hold). "Continue my Stellar" calls `resumeRun`. Asking for a different tool mid run says the current run will be paused and kept, and the new tool's approval card is the confirmation (`runs.start` pauses the active run). A paused run keeps its hold until resumed, stopped, or released by the 30 day idle sweep (spec 0004 AC-7).
- **AC-10**: Topic. The assistant helps with: running and explaining the tools, the client's own answers and reports, BeamX services and consultations, and short answers to small business questions (pricing, marketing, funding, operations), each ending with a pointer to a relevant tool or a consultation. It politely declines anything else (homework, code, news, politics, medical or legal advice, other products) in one or two sentences, with a pointer back. In the eval set, at least 95% of off topic cases are declined, and no on topic case is declined.
- **AC-11**: Voice. Replies are short (usually under 80 words), warm, plain Nigerian business English, with no jargon and no markdown headings. If the client writes in Pidgin, the reply is simple English with a light, respectful touch of Pidgin. Cards and reports stay in their fixed English.
- **AC-12**: Grounding. The assistant never states a score, price, balance or report finding that it did not get from a tool result or the run state. Prices come only from the approval card. It never claims a run was started, stopped or saved unless the tool result says so.
- **AC-13**: Every AI call uses a role from `src/assistant/models.ts`: `chat` and `helper` are `claude-opus-5-5` at effort `low`; `report` is `claude-opus-5-5` at effort `medium`. No call forces `tool_choice` or disables thinking (both are rejected by this model). The tool definitions and instructions form a byte stable prefix with a cache breakpoint, and a second breakpoint sits at the end of the history, before the run state note. Repeated turns read both from the prompt cache.
- **AC-14**: Failures never leave a blank screen. An AI error or refusal ends the turn with the friendly "try again" card (spec 0001). A tool error becomes a typed tool result the assistant explains in one sentence. An extraction failure silently falls back to the first card.
- **AC-15**: `pnpm eval:assistant` runs the real model eval set (routing, ambiguity, off topic, Pidgin, typed answers, extraction, controls; about 40 cases) and writes a dated results file under `evals/assistant/results/`. CI runs only the mock model tests. A prompt or model change needs a new results file committed with it.

## Decision

**Chosen option**: Option 1: Server driven card flow with an AI turn only for typed messages (the reasoning is in [rationale.md](rationale.md)).

`handleTurn` routes each user message one of two ways. A card submission goes to a deterministic step (save, next card, complete). Typed text goes to one AI SDK 7 `streamText` turn on Claude Opus 5.5, with registry built tools, approval gated money actions, and a per turn run state note. Known facts are proposed by one extraction call and confirmed on one card.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `migrate-ai-sdk-v6-to-v7` (`vercel/ai`, `.claude/skills/migrate-ai-sdk-v6-to-v7/`) · `ai-elements` (`vercel/ai-elements`, `.claude/skills/ai-elements/`, for the part shapes #7 renders) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Module layout (`src/assistant/`)

```
models.ts            roles chat, helper, report -> { id, effort } (report role created by spec 0005)
turn.ts              handleTurn: picks the deterministic path or the AI turn
card-flow.ts         pure decisions for answers, prefill responses and completion (returns actions; the caller runs the queries)
ai-turn.ts           streamText setup: instructions, tools, history, run state note, stopWhen
instructions.ts      the static instructions text (byte stable; no dates, ids or user data)
run-state.ts         pure: builds the per turn run state note from runs.getActive plus recent runs
tools/               startRun, resumeRun, saveAnswer, showQuestion, stopRun, restartRun (thin: Zod input, approval rule, calls db/ and tools/registry)
extract.ts           known facts extraction (structured output, helper role)
parts.ts             Zod schemas for every custom message part, plus the converter from UI messages to model messages
report-runner.ts     from spec 0005
report-status.ts     from spec 0005
evals/               (repo root) evals/assistant/cases.json, run.ts, results/
```

`src/assistant/` reaches tools only through `tools/registry.ts` (`getTool`, `toolIds`, `parseAnswer`, `nextQuestion`, `progress`, `scoreRun`). It reaches data only through `src/db/queries/` and money only through `credits.*` (spec 0004).

### Message parts (owned by `parts.ts`, validated on read and write)

| Part `type` | Role | Data | Shown as |
|---|---|---|---|
| `data-question` | assistant | `runId`, `questionId`, `view` (`QuestionView`), `progress`, `note?` (why it was shown again) | answer card (spec 0003) |
| `data-answer` | user | `runId`, `questionId`, `value` | answered bubble with Edit |
| `data-prefill` | assistant | `runId`, `items: { questionId, prompt, value, label }[]` | "From our chat" confirm card: Accept all, Edit per item |
| `data-prefill-response` | user | `runId`, `accept: questionId[]`, `edit: questionId \| null` | small bubble |
| `data-report` | assistant | `runId`, `toolId`, `toolName` | view report card; it triggers the report POST and opens the panel (spec 0005) |
| `data-error` | assistant | `kind` (`ai_error`, `refusal`, `complete_retry`, `busy`), `retry: boolean` | error card with copy from `error-copy.ts` |
| `data-retry` | user | `runId`, `action: "complete"` | none (sent by the error card's button) |

Prefill item `label` comes from `formatAnswer(view, value)`, moved from `components/answer-cards/format-answer.ts` into `tools/_kit` and re-exported. `progress` is spec 0005's `QuestionProgress`. `handleTurn` saves the user message under its client id, after taking the lock. #7's route saves the single assistant message per turn under a new server `newId()` in its `createUIMessageStream` `onFinish` (spec 0007).
| tool parts `startRun`, `resumeRun`, `restartRun`, `stopRun` | assistant | AI SDK 7 tool parts with approval state | confirm card with price and available balance, or the stop card |

The client sends `data-answer` and `data-prefill-response` parts only from cards. The server never trusts their `runId`; every query is scoped to the session user.

### Deterministic path (`card-flow.ts` + `turn.ts`)

- **Answer**: `getActive` (the run must be the conversation's active run and its tool must be current), then `parseAnswer`, `runs.saveAnswer`, then `nextQuestion`. The result is the next `data-question`, or completion.
- **Prefill response**: `saveAnswer` for each accepted id that is still valid and visible (`source = 'chat'`), then the edited question's card, or the next question.
- **Completion**: `runs.get`, `scoreRun`, `runs.complete`. On `answers_changed`, run `get`, `scoreRun` and `complete` once more, then `data-report`.
- The reply is a UI message stream with one assistant message holding the new part (AI SDK 7 UI message stream writer; #7 saves it like any message). No AI call, no metering, no `ai_usage` row.

### AI turn (`ai-turn.ts`)

- `streamText({ model: models.chat, instructions, messages, tools, stopWhen: stepCountIs(5), maxOutputTokens: 1024, providerOptions })`, with Opus 5.5 effort `low` set through the Anthropic provider options (field names checked against `node_modules/@ai-sdk/anthropic/docs/`). Never `toolChoice: 'required'` or a named tool, and no thinking or temperature settings.
- **Turn lock**: Upstash Redis `SET turn:<conversationId> <turnId> NX EX 120` (raised from 60 in spec 0007, above the chat route's 90 second `maxDuration`). The route frees it after saving the reply, through the `release` `handleTurn` returns (spec 0007); `handleTurn` frees it itself only when it returns no stream; expiry frees it if the function dies. A taken lock, or a Redis error while taking it, returns a `data-error` `busy` part ("One moment, I'm still on your last message"). Production refuses to boot without the Upstash variables.
- **Owner**: every write (deterministic path and tool `execute`) uses the owner resolved at turn start. If a write returns `not_found`, it reads `conversations.ownerOf` again and retries once (a guest link mid turn), then reports `not_found`.
- **History**: the last 30 whole UI messages of the conversation (from `conversations.open`), converted by `parts.ts`. The 4,000 character cap applies to typed text only. Card parts become short text such as `Answered "Who is your customer?": small shop owners`, and data parts stay out of the model's view.
- **Prompt cache**: the tool definitions (in a fixed order) plus `instructions` form the cached prefix, with breakpoint 1 after the instructions and breakpoint 2 on the last history message. Nothing variable goes in the instructions. The run state note sits after breakpoint 2 (confirmed, see *Provider check results*).
- **Approval mechanics** (AI SDK 7 `toolApproval` plus `experimental_refineToolInput`, confirmed in *Provider check results*):
  - **Server written inputs**: `toolInputRefinement(env)` maps each money tool to a refinement that ignores whatever the model sent and writes the server value: `startRun.shownPrice` (from `creditPrice`), `resumeRun.shownPrice` (only when no hold), `restartRun.shownPrice`, `stopRun.heldAmount`. The refinements are built per turn from the tool env (they read with `owner.current`) and may be async. A refinement read that returns `not_found` reads `conversations.ownerOf` again and retries once, like writes (a guest link mid turn).
  - **Fail closed**: a refinement catches every error and never throws. When its read fails, finds nothing, or finds a run the tool can't act on (wrong status, old tool version), it leaves the server field out. `startRun`'s price comes from the registry and can't fail (`toolId` is already a checked enum).
  - **Approval rule**: every money tool's `TOOL_APPROVAL` entry is a pure function of the refined input: the server field present (`shownPrice`, or `heldAmount` for `stopRun`) means `user-approval`, absent means `not-applicable`. It reads nothing, so the SDK's second look at the approval (on the continuation) gets the same answer, and a card with no price can never show.
  - **No spend without the field**: `execute` never holds credits or changes a run unless the server field is present. The one exception is `resumeRun` when `execute` finds an active hold (a free resume). A call without the field returns its error (`not_found`, `previous_not_completed`, `version_changed`, `approval_required`, or `try_again` when the read failed) and does nothing.
  - **Retry cap**: after a "does not match" or `price_changed`, the model calls the tool again once. A second one in the same turn makes it say that something changed and ask the client to try again (instructions; `MAX_STEPS` is the hard cap).
  - **Continuation**: the approval response comes back as tool approval parts on the next request, and `handleTurn` runs it as a continuation (not metered). The SDK runs the refinement again on the approved input and compares the two. If they differ (the price changed, or a hold appeared or was released), it turns the approval down with "Approved tool input does not match", the model sees that as a tool error, and the instructions tell it to call the tool once more for a fresh card. Otherwise `execute` runs, compares the server value with the registry and the hold again (a backstop), and the model may add one sentence.
  - **Continuation stream**: it starts with the call's output, so the turn first writes `tool-input-available` with the call's name and input from the history (`respondedCalls`). The saved reply then stands on its own (spec 0007 saves each turn as a new message).
- **Run state note**: a turn scoped `system` message (`allowSystemInMessages: true`, Anthropic `clearAt: "next_user_message"`), placed last in every step by `prepareStep` (`withNote`). It is read again after any tool event, so a step after an approved `startRun` or a `saveAnswer` sees the new state. It is built fresh each turn and never saved. It holds the active run (tool name, runId, answered n of m, the open question's prompt and options), paused runs (tool, runId, progress, whether a hold is active), and the last 5 completed runs with report status. It also holds the free messages left today, when spec 0004 metadata gives it.
- After the stream, in this order: if `startRun` succeeded this turn, run extraction and append `data-prefill` or the first card (AC-5). Otherwise, if `saveAnswer` completed the run, append the completion parts. Otherwise, if a run is active and no approval is pending, append the open card (AC-8).
- **Refusal fallback**: the Anthropic server side fallback is on (`providerOptions.anthropic.fallbacks: "default"`; `@ai-sdk/anthropic` adds the beta header). A refusal that still comes through (`finishReason` `content-filter`) gets the refusal card and an `assistant_refusal` log.

### Provider check results (build plan task 0, 2026-11-20)

Checked against `node_modules/ai/docs/`, `node_modules/@ai-sdk/anthropic/docs/05-anthropic.mdx`, the `ai` package source, and the mock model tests in `ai-turn.test.ts`.

| Question | Result | How the build uses it |
|---|---|---|
| Can the server write tool inputs before the approval card? | Yes: `experimental_refineToolInput` (per tool, may be async). The refined input is what the stream parts, the approval request and `execute` get. | `toolInputRefinement(env)` writes `shownPrice` and `heldAmount`. A model sent `shownPrice` is overwritten (tested). |
| What happens to a price that changed between card and tap? | On the continuation the SDK revalidates the approved input, runs the refinement again, and deep compares. A difference marks the approval invalid with "Approved tool input does not match the validated schema output", returned to the model as a tool error. `execute` never runs. | The instructions tell the model to call the tool once more; the test "a price change between the card and the tap starts nothing" shows the fresh card at the new price. `execute`'s own check stays as a backstop. |
| Does the approval status get worked out again on the continuation? | Yes, from the approved (refined) input. Only `denied` stops it. | `resumeRun`'s approval function reads only the input, never the DB, so both looks agree. |
| Mid conversation `system` message for the run state note? | Supported: `allowSystemInMessages: true`, with Anthropic `clearAt: "next_user_message"`. No `<run_state>` fallback inside the user message is needed. | Set per step in `prepareStep`, so it can change after a tool runs within the turn. The note text is still wrapped in `<run_state>` tags so it reads as data. |
| Continuation stream contents | It starts with the tool output, not the call. | The turn writes `tool-input-available` from the history first (`respondedCalls`). |
| Effort, two cache breakpoints | `providerOptions.anthropic.effort` and `cacheControl: { type: "ephemeral" }` on the instructions message and on the last history message. The serialized tools and instructions match across turns (snapshot test). | As specced. Cache reads on real traffic are confirmed by the first eval run (task 7). |
| Server side fallbacks | `fallbacks: "default"` is supported; the provider adds the beta header. | On. |

### Tools (`src/assistant/tools/`)

| Tool | Input (Zod, `strict`) | Approval | Calls | Result |
|---|---|---|---|---|
| `startRun` | `toolId` (enum from `toolIds`), `shownPrice` (server written) | always | `credits.ensureAccount`, then `credits.startRunWithHold(owner, conversationId, toolId, getTool(toolId).version, creditPrice)` (spec 0004) | `{ ok, runId }` or `price_changed`, `insufficient_credits`, `run_in_progress` ("one moment", then the open card) |
| `resumeRun` | `runId`, `shownPrice?` (server written by `refineResumeRun`: the run's tool `creditPrice` only when `credits.runQuote` finds the run `paused`, on the current tool version, with no active hold; left out otherwise) | only when the refined input has `shownPrice` | `execute` reads the run again. Old tool version: `version_changed`. Hold found: `runs.resume`. No hold and `shownPrice` passes `priceStillValid`: `credits.resumeRunWithHold(owner, runId, creditPrice)`. No hold and no `shownPrice` (a hold released after the refinement): `approval_required`, and the model calls again for a fresh card | `{ ok, runId }`, or `approval_required`, `price_changed`, `version_changed`, `try_again` and the errors of spec 0004 |
| `restartRun` | `previousRunId`, `shownPrice` (optional in the schema; server written as `getTool(toolId).creditPrice` of the previous run's tool, only when `credits.runQuote` finds it `completed`) | only when the refined input has `shownPrice` | new `credits.startFromWithHold` (composes `runs.startFrom` and the hold, as `startRunWithHold` does). On `version_changed` the fresh run uses the same current `creditPrice` | `{ ok, runId }` or `price_changed`, `insufficient_credits`, `version_changed`, `previous_not_completed`, `not_found`, `try_again` |
| `stopRun` | `runId`, `heldAmount` (optional in the schema; server written by `refineStopRun` from `credits.runQuote`: the hold amount, or 0 with no hold, only when the run is `in_progress` or `paused`) | only when the refined input has `heldAmount` | `runs.abandon` (active or paused; releases whatever hold exists at that moment; `heldAmount` is only the card's wording and `execute` ignores it) | `{ ok }` or `already_completed`, `not_found`, `try_again` |
| `saveAnswer` | `runId`, `questionId` (any visible question of the active run), `value` | no | `parseAnswer`, `runs.saveAnswer` (`source = 'chat'`) | `{ ok, next: questionId \| null }` or `invalid_answer` with the reason, `not_visible`, `run_just_started` (the run was started earlier in this turn, so its facts go on the prefill card) |
| `showQuestion` | `runId`, `questionId` | no | checks that the run is active and the question is visible | `{ ok }`; the server appends that card |

On `version_changed`, `restartRun` starts a fresh run of the same tool (same approval and price) and offers the old answers per AC-5b.

A **paused run on an old tool version** can't be resumed, because the card flow refuses answers to a run whose tool isn't current. `resumeRun` returns `version_changed`, and the assistant offers to stop the old run (`stopRun`, which returns any held credits) and start a fresh one (`startRun`), each with its own card.

**`credits.runQuote(owner, runId)`** (new, `src/db/queries/credits.ts`): one owner scoped read, `tool_run` left joined to its active `run` hold, returning `Result<{ toolId, toolVersion, status, heldAmount: number | null }, NotFound>`. It feeds the `resumeRun`, `restartRun` and `stopRun` refinements, so each money tool call costs one small read before the card. The refinements use `status` and `toolVersion` as the tool rows say. They map `toolId` to `creditPrice` with `getTool`; an unknown tool leaves the field out, and `execute` then returns the tool's error.

**Extraction** (`extract.ts`, role `helper`): input is the tool's questions as `{ id, prompt, kind, options? }` plus the client text of the 30 message window, inside a fenced data block. Output is `Output.object` with `z.object({ answers: z.array(z.object({ questionId: z.enum(ids), value: z.union([z.string(), z.number(), z.array(z.string())]) })) })`. The prompt text lives in `extract.ts`. Usage `callKey` is `<runId>:extraction`; a duplicate is a no op.

**Data model sketch**: no new tables or columns. Uses `conversation`, `message` (`parts` jsonb holds the parts above), `tool_run`, `tool_run_answer` (`source` `client` or `chat`), `report`, `credit_hold` and `ai_usage` (`purpose` `chat` for turns, `extraction` for extraction) as specced. New query composition `credits.startFromWithHold` in `src/db/queries/credits.ts`, following the `startRunWithHold` pattern (one batch, `billing_assert`, ledger rules of spec 0004), and the read `credits.runQuote` (above).

**State transitions**: the assistant drives the spec 0002 run machine and adds no states. Approve start → `in_progress` (the previous active run becomes `paused`). All answered → `completed` (and the report is `pending`). Stop approved → `abandoned`. Resume → `in_progress`.

**API surface** (functions; the HTTP route is #7's):

| Function | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|
| `handleTurn(deps, input)` | `userId`, `conversationId`, `message` (validated UI message) | UI message stream (deterministic) or the `streamText` result | session user, conversation owner | `not_found` (conversation), `invalid_message` |
| `buildRunState(state)` | `getActive` result, recent runs, billing metadata | note text | pure | none |
| `extractKnownFacts(deps, { tool, history })` | tool module, the last 30 messages as text | `{ questionId, value }[]` (already parsed and visible) | server | returns `[]` on any failure |

`deps` injects the model provider, the query functions and the clock, so tests use the AI SDK mock model.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| startRun tool | enum values, descriptions | `toolIds`, `name`, `whenToUse` (spec 0005 registry) |
| approval card | price | `creditPrice`, written as `shownPrice` by the server's `experimental_refineToolInput` (spec 0004). For `resumeRun` and `restartRun`, the tool comes from `credits.runQuote` |
| money tools | whether to ask | the refined input: the server field present (`credits.runQuote` status, version and hold, per the tool rows) |
| resume and restart cards | tool name, price | `getTool(runQuote.toolId)`: `name`, `creditPrice` |
| approval card | available balance | `credits.getSummary` (spec 0004) |
| card | question view, progress | `nextQuestion`, `progress` over the run's answers (spec 0005 `_kit`) |
| completion | scores, fingerprint | `scoreRun` (spec 0005 AC-16) |
| run state note | active and paused runs, progress, hold | `runs.getActive` (one batch) |
| run state note | last 5 completed runs and report status | existing `reports.listForConversation`, first 5 completed |
| handleTurn | `metered` | AI path, not an approval continuation, and no `in_progress` run at turn start (from the same `getActive` read) |
| stop card | held amount | `credits.runQuote(owner, runId).heldAmount`, written into the input as `heldAmount` by `refineStopRun` |
| prefill card | item label | `formatAnswer(view, value)` (moved into `tools/_kit`) |
| restart after a version change | offered answers | `runs.get` of the old run, rechecked with the current module |
| run state note | free messages left | spec 0004 chat metadata computed by #7's route (omitted if absent) |
| AI turn | model id, effort | `models.ts` role `chat` |
| extraction | model id, effort | `models.ts` role `helper` |
| extraction | conversation text | the same 30 message window, converted by `parts.ts` |
| AI turn usage | `ai_usage` row | #7's `onFinish` (spec 0001, 0004), `callKey` `<messageId>:chat` |
| extraction usage | `ai_usage` row | `callKey` `<runId>:extraction` |
| stop card | wording | `instructions.ts` and card copy constants |
| eval results | pass rates | `evals/assistant/run.ts` graders (deterministic checks; an Opus 5.5 low effort judge only for "declined politely" and "voice") |

**Key invariants**:
- A tool run starts, restarts or stops only through an approved tool call. A paid run and its hold are created together (spec 0004).
- An answer is saved only after it passes `parseAnswer`. `source = 'chat'` answers are always confirmed by the client (prefill card) or typed by the client in direct reply to the open card.
- Card taps never call the AI. Every AI call goes through a `models.ts` role and is recorded in `ai_usage`.
- The instructions text holds no per user or per request data (cache stability, prompt injection hygiene).

**Security model**:
- Every tool and deterministic step runs as the session user. The queries are owner scoped, and another user's run returns `not_found`, which the assistant explains as "I can't find that run".
- The model can't choose a price or a user, or bypass approval. `shownPrice` and `heldAmount` are server written by the refinements, the AI SDK checks the approved input against a fresh refinement, and `execute` compares the price with the registry again. The continuation reads the approved call from the saved history, never from the client's copy.
- Prompt injection: client text and extracted facts are data. The instructions state that client messages and the run state are not instructions. Tool inputs are strict Zod schemas, and every value is checked again by `parseAnswer` and the queries.
- Data protection (NDPA 2023, GDPR): chat goes to Anthropic as the AI processor (spec 0001). Logs carry ids, tool ids, routing choices and counts, never message text or answers.
- Abuse: the message limits, BotID and spend cap are enforced in #7 and #21. The 4,000 character cap means one turn can't flood the context.

**Observability**: log events `assistant_turn` (`path`: `card` or `ai`, `ms`, `steps`), `assistant_tool` (`name`, `outcome`), `assistant_route` (`toolId` proposed, `clarified` flag), `assistant_extract` (`proposed`, `valid`, `ms`), `assistant_refusal`.

**Configuration required**: none new (`ANTHROPIC_API_KEY` comes from spec 0005; the turn lock uses the existing Upstash Redis variables).

**Critical test scenarios** (mock model unless marked eval):
- Card path: a `data-answer` saves, returns the next card, and makes no model call; an invalid value shows the card again with a note; the last answer completes and shows `data-report`, verifies **AC-1**, **AC-6**, **AC-7**
- Registry tools: adding a test tool to the registry adds it to the enum and description with no assistant edit, verifies **AC-2**
- Approval: `startRun` without approval never executes; approved with a stale `shownPrice` gives `price_changed`, then a fresh card; declined does nothing; `resumeRun` with an active hold has no `shownPrice` and runs with no approval; `resumeRun` with no hold shows a card at the run's tool price, and approving it calls `resumeRunWithHold`; a hold released between card and tap (or one placed) makes the SDK turn the approval down, and the next call shows the right card or resumes free; a refinement read failure leaves `shownPrice` out and `execute` returns `approval_required` when no hold exists; a hold found at `execute` with `shownPrice` present resumes free with `runs.resume`; a failed read on `restartRun` or `stopRun` shows no card and changes nothing (`try_again`); `restartRun` with an unknown previous run returns `not_found` with no card; a guest link between the turn start and the refinement read retries with the new owner; a paused run on an old tool version returns `version_changed`; a second "does not match" in one turn ends with the try again sentence, not a third card, verifies **AC-3**
- Prefill: extraction returns 3 values, 1 invalid and 1 for a hidden question; the card lists 1; Accept saves it with `source = 'chat'`; Edit opens the card; an extraction timeout goes straight to the first card, verifies **AC-5**, **AC-14**
- Typed answer: "about 300k naira" while the investment card is open calls `saveAnswer` with a valid option, then the next card; an off card question gets a reply, then the same card, verifies **AC-8**
- Controls: stop, change during and after a run, resume, and switching tools mid run each call the right tool and query, verifies **AC-9**
- Cache: two consecutive turns produce an identical prefix (snapshot of the serialized tools and instructions), verifies **AC-13**
- Failure: a model error gives the try again card; a tool `not_found` is explained, verifies **AC-14**
- Concurrency: a card tap while an AI turn holds the lock gets `busy` and saves nothing; a double approved `startRun` gives one run and `run_in_progress`, verifies **AC-1**, **AC-3**
- Guest link mid turn: the owner changes after the turn starts; a write's `not_found` reads the owner again and succeeds, verifies **AC-1**
- Pending approval: a turn ending with an approval request adds no question card, verifies **AC-8**
- Stop wording: a paused run with no hold shows "Stop this run?"; with a hold of 30, the amount shows, verifies **AC-9**
- Version change restart: the old answers are rechecked and offered on the prefill card, keeping their source, verifies **AC-5b**
- Metering flag: a typed message with no active run gives `metered: true`; during a run, card taps and approval taps give `false`, verifies **AC-1**
- Eval grading: an ambiguous case passes if the assistant asks one clarifying question or proposes an allowed tool, verifies **AC-4**, **AC-15**
- Eval (real model): routing including ambiguity, off topic declines with no on topic declines, Pidgin voice, typed answer mapping, extraction accuracy, grounding (no invented numbers), verifies **AC-4**, **AC-10**, **AC-11**, **AC-12**, **AC-15**

## Build plan

Tracer Bullet: get one thread through the brain first (route to Stellar, approve, tap through the cards, complete) on the mock model, then thicken with typed answers, extraction, controls and evals.

0. Provider check (done, results in *Provider check results*): effort, two cache breakpoints, a mid conversation `system` message, `toolApproval` input rewriting through `experimental_refineToolInput`, and server side `fallbacks`. No fallback was needed, satisfies **AC-13**
1. `models.ts` roles (`chat`, `helper`, `report`), `parts.ts` part schemas and the converter, `card-flow.ts` (including the open card rule) with unit tests, `formatAnswer` moved to `tools/_kit`, satisfies **AC-1**, **AC-6**, **AC-6b**, **AC-7**, **AC-13**
2. `handleTurn` with the owner lookup, the turn lock, and the deterministic path (answer, completion, `complete_retry`, `data-report`), with integration tests on a Neon branch using a funded Stellar run, satisfies **AC-1**, **AC-6**, **AC-7**
3. The AI turn: `instructions.ts` (topic, voice, grounding, routing, ambiguity, approval behaviour), `run-state.ts`, the `startRun` tool built from the registry with `toolApproval`, the cache prefix, history, and the card appended after the stream; mock model tests, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**
4. `saveAnswer` and `showQuestion` (typed answers, reopening cards), satisfies **AC-8**, **AC-9**
5. `extract.ts` and the prefill card flow (`data-prefill`, `data-prefill-response`, the 40 character skip, the 8 second timeout), run after the stream, satisfies **AC-5**, **AC-14**
6. Refactor `toolInputRefinement` from a synchronous map built once (today `refineStartRun(getPrice)`) into one built per turn from the tool env, with async, fail closed refinements and an input based approval function for every money tool. Then `credits.runQuote` (integration test), `stopRun` (with `refineStopRun` writing `heldAmount`), `resumeRun` (with `refineResumeRun`, the input based approval function, and the hold recheck in `execute`), `restartRun` (with its refinement and the version change path), and the new `credits.startFromWithHold` with an integration test; switching tools mid run, satisfies **AC-3**, **AC-5b**, **AC-9**
7. Eval harness: `evals/assistant/cases.json` (about 40 cases), `run.ts` with graders, `pnpm eval:assistant`, and the first results file, satisfies **AC-4**, **AC-10**, **AC-11**, **AC-12**, **AC-15**

## Consequences

**Positive**:
- Answering is instant and free, whatever the tool's size. Progress can't drift, because the server owns the question order.
- The AI is spent only where it adds value: understanding typed messages, routing and explaining.
- New tools need no assistant change, and every money action keeps spec 0004's approval guarantees.
- One model for all roles means one cache and one behaviour set to evaluate.

**Negative / tradeoffs**:
- The deterministic card replies feel less conversational than an AI written lead in for each question.
- Opus 5.5 is the most expensive option per chat turn (about twice Sonnet 5.5). Metered chat covers it, but free guest messages cost BeamX more.
- The 30 message window means very long chats lose early detail (compaction can come later).
- Real model evals are manual, so a prompt regression can slip through if someone skips `pnpm eval:assistant`.
- One more credits query (`startFromWithHold`) adds to the money surface.

**Neutral**:
- `src/assistant/` grows from spec 0005's runner into the main chat module. #13 ("Ask about your results") extends this AI turn with report context.
- The run state note uses a mid conversation `system` message, a model feature to keep in mind if the model changes.

## Follow-up

- [ ] #7: build `POST /api/chat` on `handleTurn` (saving in `onFinish`, resumable streams, `useChat`, rendering the parts above, metering and limits). If the route calls `validateUIMessages` on messages with approvals, pass it the same `toolInputRefinement` so it can rebuild the approved input (AI SDK docs, `validate-ui-messages`). Saved approval parts need not keep the SDK's `inputSchemaInput`: the refinements overwrite only server fields, so the recheck catches a change either way.
- [ ] Task 7: the first real model eval run also confirms prompt cache reads (both breakpoints) on real traffic; record it in the results file.
- [ ] #16: add a consultation booking card and link. Until then, the assistant describes consultations without a link.
- [ ] #9 (profile): add profile facts as a second prefill source (`source = 'profile'`) using `factKey`.
- [ ] Revisit the chat model (Opus 5.5 versus Sonnet 5.5) after a month of real usage and cost data.
