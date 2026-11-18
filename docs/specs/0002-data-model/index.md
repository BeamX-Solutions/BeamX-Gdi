# 0002. Data model for the BeamX Workspace

**Date**: 2026-11-17
**Status**: Accepted

## Summary

This spec fixes the shape of everything the workspace stores: guests and accounts, chats and their messages, tool runs with their answers, scores, and reports, plus the later records (business profile, uploads, consultation bookings, consent, and an AI cost ledger). The whole model is designed now so later slices only ever add tables or optional columns, never rewrite existing ones. Feature #3 builds the database foundation and the tables the first Stellar thread needs; every later table ships with the feature that first uses it. Each user's data hangs off their user row, so a guest becomes an account by moving one owner id, and deleting an account removes everything in one cascade (an automatic chain of deletes).

## Requirements

**User stories**:
- As a guest, I want my chat, answers, and report saved as I go so a refresh or a pause never loses my work.
- As a client, I want to pause a long tool (Luna), try another one, and come back to it later.
- As a guest who signs up, I want everything I did as a guest to appear in my new account.
- As a client, I want old reports to stay exactly as they were, even after I change my answers or a tool is updated.
- As a client, I want to delete my account and know all my data is gone.
- As a developer, I want one typed query layer that always scopes data to the signed in user, so I can't leak another client's data by accident.

**Acceptance criteria**:
- **AC-1**: A guest (anonymous Better Auth user) can create a conversation, append messages, start a tool run, save answers, complete the run with scores, and get a ready report; a fresh request reads all of it back by id.
- **AC-2**: Saving an answer is one database round trip. Saving the same `question_id` twice leaves one row holding the latest value and source. Saving to a run that is not `in_progress` (including one that completes concurrently), or not owned by the caller, changes nothing and returns a typed error.
- **AC-3**: A conversation has at most one `in_progress` run (enforced by the database). Starting a tool while another run is active pauses the active run and starts the new one in one atomic step; resuming a paused run pauses whatever is active the same way.
- **AC-4**: A completed run is frozen: its answers and scores cannot be changed through the query layer, and its scores are accepted only if they were computed from the run's current answers. "Change my answers" starts a new run in the same conversation prefilled with copies of the old answers; the old run and its report stay untouched.
- **AC-5**: A report moves `pending → generating → ready | failed`, and `failed → generating` on retry, at most 3 attempts per run. Two concurrent attempts to start generation result in exactly one winner. A report stuck in `generating` longer than 10 minutes can be reclaimed, and the reclaimed (older) attempt can no longer write its result. A completed run whose report failed still returns its scores.
- **AC-6**: When a guest links to an account, every row the guest owns is moved to the new user in one atomic batch, before Better Auth deletes the anonymous user. If the move fails, sign up fails and the guest and their data are not deleted. A message or usage record that finishes after the link still lands on the right owner.
- **AC-7**: Deleting a user removes every row they own by cascade. `ai_usage` rows remain with `user_id` set to null.
- **AC-8**: Every user facing query takes the session `userId` and filters by it. Asking for another user's conversation, run, or report returns a typed `not_found`, never their data.
- **AC-9**: A run from any registered tool is stored with `tool_id` and `tool_version`. Adding a new tool needs no migration.
- **AC-10**: Opening a conversation for follow up chat loads the ownership check, its latest messages (paginated, oldest first within the page), and its runs with reports in one database round trip.
- **AC-11**: Migrations are generated SQL files committed to the repo, and CI fails if the schema and the committed migrations drift. They apply cleanly to a fresh Neon branch, and CI runs the database integration tests against a throwaway Neon branch on every PR.
- **AC-12**: The tables reserved for later features (`business_profile`, `file`, `consultation`, `consultation_run`, `consent`, and `tool_run_answer.file_id`) can be added with only new tables, new nullable columns, new foreign keys, and new enum values: no renames, type changes, or rewrites of existing columns.

## Decision

**Chosen option**: Option 1: Relational core with JSONB for tool owned payloads

Every entity is a normal Postgres table with real foreign keys and cascades, all owned through `user_id`. Only payloads whose shape belongs to a tool or to the AI SDK (message parts, answer values, scores, report content, profile facts) are JSONB, validated by Zod in the layer that owns the shape.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `neon-serverless` (`neondatabase/ai-rules`, `.claude/skills/neon-serverless/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`, branch per CI run) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`, message persistence) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Conventions (every table)

- **Primary keys**: `id uuid`. App tables use UUID v7 (time ordered random ids) from one helper, `newId()` in `src/db/id.ts` (the `uuid` package's `v7`), wired into every Drizzle `$defaultFn` and the AI SDK `generateId` on server and client. Better Auth tables also use uuid columns; whether they get v7 or plain random uuids depends on the build step 4 spike (below). Client supplied message ids are only checked to be uuids.
- **Timestamps**: `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()` with Drizzle `$onUpdate`. **`$onUpdate` does not fire for raw `sql` statements or `onConflictDoUpdate`, so every such statement sets `updated_at = now()` itself.** All times are UTC. Timestamps used in cursors are read as strings (`mode: 'string'`), never JS `Date`, which drops microseconds.
- **Enums**: Drizzle `pgEnum`. Adding a value is `ALTER TYPE ... ADD VALUE` (safe, but the new value cannot be used in the same migration). `tool_id` is deliberately `text`, checked by Zod against `tools/registry.ts`, so a new tool needs no migration.
- **JSONB**: typed in Drizzle as `unknown` (no shape claims in `src/db`). The owner validates on read and write: message parts with the AI SDK's message validator in `assistant/`; answers, scores, and report content with the tool module's Zod schemas for that `tool_version` (feature #5); profile facts with the catalog from feature #9. A row that fails validation becomes a typed error the UI renders as a friendly card.
- **Numeric**: `numeric` columns (`cost_usd`) come back from the driver as strings; convert at the query layer edge.
- **Results and errors**: `Result<T, E>` and its helpers live in `src/lib/result.ts`. Each query module exports its error type as a union of `{ code: '...' }` objects. Unique violations (Postgres `23505`, wrapped by Drizzle in `DrizzleQueryError`) are caught, matched on `cause.constraint` name, and mapped to a typed error; any other database error throws.
- **Ownership**: every user owned table has `user_id` with an index, or reaches a user through a cascading parent.
- **Schema files**: `src/db/schema/` one file per domain (`auth.ts` generated by Better Auth, `chat.ts`, `runs.ts`, `usage.ts`, later `profile.ts`, `files.ts`, `consultations.ts`, `consent.ts`) re-exported from `src/db/schema/index.ts`.

### Data model sketch

Better Auth owns `user`, `session`, `account`, `verification` (generated by its CLI, uuid ids). The `anonymous` plugin adds `user.is_anonymous boolean`. `session` and `account` cascade on user delete (Better Auth default). `verification` has no user link; its rows expire on their own.

**Built by feature #3:**

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `conversation` | `id` | uuid | no | PK |
| | `user_id` | uuid | no | FK `user.id` ON DELETE CASCADE |
| | `title` | text | yes | filled later (feature #14 decides how) |
| | `last_message_at` | timestamptz | no | default now(); bumped by every message append |
| | `created_at`, `updated_at` | timestamptz | no | |
| `message` | `id` | uuid | no | PK (AI SDK message id) |
| | `seq` | bigint | no | `generated always as identity`; the thread order (never clock time) |
| | `conversation_id` | uuid | no | FK `conversation.id` ON DELETE CASCADE |
| | `role` | `message_role` enum (`system`, `user`, `assistant`) | no | |
| | `parts` | jsonb | no | AI SDK 7 UI message parts; answer card and report parts carry the run id |
| | `metadata` | jsonb | yes | AI SDK message metadata |
| | `created_at`, `updated_at` | timestamptz | no | parts can be updated when the AI SDK continues a message with the same id |
| `tool_run` | `id` | uuid | no | PK |
| | `user_id` | uuid | no | FK `user.id` ON DELETE CASCADE |
| | `conversation_id` | uuid | yes | FK `conversation.id` ON DELETE SET NULL (reports survive a deleted chat) |
| | `tool_id` | text | no | e.g. `stellar`; Zod checked against the registry |
| | `tool_version` | text | no | e.g. `1`; from the tool module |
| | `status` | `run_status` enum (`in_progress`, `paused`, `completed`, `abandoned`) | no | default `in_progress` |
| | `scores` | jsonb | yes | output of the tool's pure scoring function |
| | `based_on_run_id` | uuid | yes | FK `tool_run.id` ON DELETE SET NULL; the run this one was prefilled from (AC-4) |
| | `completed_at` | timestamptz | yes | |
| | `created_at`, `updated_at` | timestamptz | no | `updated_at` is bumped by every answer save (last activity) |
| `tool_run_answer` | `id` | uuid | no | PK |
| | `run_id` | uuid | no | FK `tool_run.id` ON DELETE CASCADE |
| | `question_id` | text | no | from the tool module's question list |
| | `value` | jsonb | no | validated by the tool's question schema |
| | `source` | `answer_source` enum (`client`, `profile`, `chat`, `file`) | no | client = card; profile = profile prefill; chat = pulled from earlier messages and confirmed; file = upload prefill (slice 6) |
| | `created_at`, `updated_at` | timestamptz | no | |
| `report` | `id` | uuid | no | PK |
| | `run_id` | uuid | no | FK `tool_run.id` ON DELETE CASCADE, unique (1:1) |
| | `status` | `report_status` enum (`pending`, `generating`, `ready`, `failed`) | no | default `pending` |
| | `content` | jsonb | yes | structured report from the tool's report step |
| | `error` | jsonb | yes | `{ kind, message }`; `kind` is one of `timeout`, `provider_overloaded`, `invalid_output`, `spend_cap`, `unknown` (Zod); `message` is a short safe text, never a stack trace, prompt, or client data |
| | `model` | text | yes | model id used (from `src/assistant/models.ts`) |
| | `attempts` | integer | no | default 0; +1 on each claim; max 3 |
| | `generated_at` | timestamptz | yes | set when `ready` |
| | `created_at`, `updated_at` | timestamptz | no | `updated_at` is the claim time used for stale reclaim |
| `ai_usage` | `id` | uuid | no | PK |
| | `call_key` | text | yes | unique; `<messageId or runId>:<purpose>`; makes a replayed `onFinish` harmless |
| | `user_id` | uuid | yes | FK `user.id` ON DELETE SET NULL |
| | `conversation_id` | uuid | yes | FK `conversation.id` ON DELETE SET NULL |
| | `run_id` | uuid | yes | FK `tool_run.id` ON DELETE SET NULL |
| | `purpose` | `ai_purpose` enum (`chat`, `report`, `title`, `extraction`) | no | |
| | `model` | text | no | |
| | `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | integer | no | default 0; from AI SDK `usage` |
| | `cost_usd` | numeric(12,6) | no | price at the time of the call, from `src/lib/ai-cost.ts` |
| | `created_at` | timestamptz | no | append only |

**Reserved for later features** (designed here, built by the named feature, additive only):

| Table | Columns | Built by |
|---|---|---|
| `business_profile` | `id`; `user_id` uuid not null unique, FK user CASCADE; `facts` jsonb not null default `'{}'` shaped `Record<profileKey, { value, sourceRunId: uuid \| null, updatedAt: ISO string }>`; timestamps | #9 (catalog of keys decided there) |
| `file` | `id`; `user_id` not null FK user CASCADE; `conversation_id` null FK SET NULL; `blob_pathname` text not null unique; `original_name` text; `content_type` text; `size_bytes` integer; timestamps | #17 (extraction columns added there as nullable) |
| `tool_run_answer.file_id` | uuid null, FK `file.id` ON DELETE SET NULL, indexed | #17 |
| `consultation` | `id`; `user_id` null FK user SET NULL; `contact_name` text not null; `contact_email` text not null; `contact_phone` text null; `scheduled_at` timestamptz null; `timezone` text null (IANA); `external_ref` text null (booking provider id); `note` text null; `status` `consultation_status` enum (`requested`, `confirmed`, `cancelled`, `completed`, `no_show`); timestamps | #16 (retention period decided by #18) |
| `consultation_run` | `consultation_id` FK CASCADE; `run_id` FK `tool_run.id` CASCADE; PK (`consultation_id`, `run_id`); index `run_id` | #16 |
| `consent` | `id`; `user_id` not null FK user CASCADE; `kind` `consent_kind` enum (`terms`, `privacy`, `analytics_cookies`, more added by #18); `version` text not null; `granted` boolean not null; `created_at`; append only | #18 |

**Relationships** (ERD):

```
user 1──N conversation 1──N message
user 1──N tool_run N──1 conversation (nullable)
tool_run 1──N tool_run_answer        tool_run 1──1 report
tool_run 0..1──N tool_run (based_on_run_id)
user 1──N ai_usage (nullable)        user 1──1 business_profile      (#9)
user 1──N file 1──N tool_run_answer (#17)
user 0..1──N consultation N──M tool_run via consultation_run         (#16)
user 1──N consent                                                     (#18)
```

**Indexes and constraints:**
- `conversation (user_id, last_message_at desc, id desc)`: sidebar list, keyset pagination.
- `message (conversation_id, seq)`: thread load, keyset pagination.
- `tool_run (user_id, created_at desc)`; `tool_run (conversation_id)`; `tool_run (based_on_run_id)`.
- `tool_run_one_active_per_conversation`: unique `(conversation_id)` WHERE `status = 'in_progress'` (AC-3). Paused runs are not limited.
- `tool_run_completed_has_scores`: CHECK `(status = 'completed') = (scores IS NOT NULL AND completed_at IS NOT NULL)`.
- `tool_run_answer` unique `(run_id, question_id)` (AC-2).
- `report` unique `(run_id)`; CHECK `status <> 'ready' OR content IS NOT NULL`; CHECK `attempts BETWEEN 0 AND 3`.
- `ai_usage` unique `(call_key)`; indexes `(created_at)`, `(user_id)`, `(run_id)`, `(conversation_id)`: cost reports and fast SET NULL on delete.
- Every FK column used by a cascade or SET NULL is indexed.

### State transitions

```
tool_run:  in_progress ──pause (another tool starts, or the client pauses)──▶ paused
           paused ──resume (pauses whatever is active first)──▶ in_progress
           in_progress ──completeRun──▶ completed   (scores set, report row created as pending)
           in_progress | paused ──abandonRun──▶ abandoned   (client says stop, or the chat is deleted)
           completed and abandoned are final.

report:    pending ──claim──▶ generating ──▶ ready
                                   └───────▶ failed ──claim (retry, attempts < 3)──▶ generating
           generating with updated_at older than 10 min ──claim (attempts < 3)──▶ generating (stale reclaim)
```

Transitions are compare and set updates (`UPDATE ... WHERE status = <expected>`). Every compare and set batch ends with a SELECT of the current row, so zero rows updated is turned into the exact typed error (`not_found`, `not_in_progress`, `already_ready`, and so on) and the idempotent path still returns the row.

### API surface

There are no new HTTP endpoints. The surface is the query layer in `src/db/queries/`, plain functions called by routes, Server Actions, `assistant/`, and `auth/`. Every function returns `Result<T, E>` for expected outcomes; unexpected infrastructure failures (network, Neon down) throw and are caught at the route edge, which renders the "try again" card (spec 0001).

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `conversations.create` | write | `userId`, `title?` | conversation | session user | none |
| `conversations.get` | read | `userId`, `conversationId` | conversation | owner | `not_found` |
| `conversations.list` | read | `userId`, `cursor?`, `limit` (default 30, max 100) | page + `nextCursor` | owner | none |
| `conversations.open` | read (batch) | `userId`, `conversationId`, `before?` | conversation, latest messages, runs with reports | owner | `not_found` |
| `conversations.delete` | write (batch) | `userId`, `conversationId` | ok | owner | `not_found` |
| `conversations.ownerOf` | read | `conversationId` | the conversation's current `user_id` | server only (`onFinish`, the report step) | `not_found` |
| `messages.append` | write (batch) | `userId`, `conversationId`, `messages[]` of `{ id, role, parts, metadata? }` | count | owner | `not_found` |
| `messages.listRecent` | read | `userId`, `conversationId`, `before?` (a `seq`), `limit` (default 100) | messages oldest first + `nextCursor` | owner | `not_found` |
| `runs.start` | write (batch) | `userId`, `conversationId`, `toolId`, `toolVersion` | run (+ id of the run it paused, if any) | owner of conversation | `not_found` |
| `runs.pause` | write | `userId`, `runId` | run | owner | `not_found`, `not_in_progress` (already paused returns ok) |
| `runs.resume` | write (batch) | `userId`, `runId` | run (+ id of the run it paused, if any) | owner | `not_found`, `not_paused` (already in progress returns ok) |
| `runs.startFrom` | write (batch) | `userId`, `previousRunId`, `toolVersion` | new run with copied answers | owner | `not_found`, `previous_not_completed`, `no_conversation`, `version_changed` |
| `runs.saveAnswer` | write (1 statement) | `userId`, `runId`, `questionId`, `value`, `source` | answer | owner, run `in_progress` | `not_found_or_not_in_progress` |
| `runs.complete` | write (batch) | `userId`, `runId`, `scores`, `answerCount`, `lastAnswerAt` | run + pending report | owner | `not_found`, `not_in_progress`, `answers_changed` (already completed returns ok, idempotent) |
| `runs.abandon` | write | `userId`, `runId` | run | owner | `not_found`, `already_completed` (already abandoned returns ok) |
| `runs.get` | read (batch) | `userId`, `runId` | run + answers + report | owner | `not_found` |
| `runs.getActive` | read (batch) | `userId`, `conversationId` | active run + answers, or null; plus paused runs in the chat | owner | none |
| `runs.ownerOf` | read | `runId` | the run's current `user_id` | server only (the report step) | `not_found` |
| `reports.claim` | write (CAS) | `userId`, `runId` | report (`generating`) with its `attempts` number | owner | `not_found`, `already_generating`, `already_ready`, `attempts_exhausted` |
| `reports.markReady` | write (CAS) | `runId`, `attempt`, `content`, `model` | report | server only (after a successful claim) | `stale_attempt` |
| `reports.markFailed` | write (CAS) | `runId`, `attempt`, `error` | report | server only | `stale_attempt` |
| `reports.listForConversation` | read | `userId`, `conversationId` | every run in the chat (all statuses), newest first, each with its report or null | owner | `not_found` |
| `usage.record` | write | `callKey`, `userId?`, `conversationId?`, `runId?`, `purpose`, `model`, token counts, `costUsd` | id or `duplicate` | server only (`onFinish`) | none |
| `users.linkGuest` | write (batch) | `guestUserId`, `newUserId` | moved row counts (from `RETURNING id` per statement) | server only (`onLinkAccount`) | throws on any failure |

Implementation notes the build must follow:
- **`runs.saveAnswer`** is one `INSERT ... SELECT ... FROM tool_run WHERE id = $run AND user_id = $user AND status = 'in_progress' FOR SHARE ON CONFLICT (run_id, question_id) DO UPDATE SET value, source, updated_at = now()`, followed in the same batch by `UPDATE tool_run SET updated_at = now()`. `FOR SHARE` makes a concurrent `complete` wait, so an answer can never land in a completed run. It only works together with the `FOR UPDATE` lock that `complete` takes first (next note). Zero rows returned means `not_found_or_not_in_progress`. Use Drizzle `insert().select()` with `.for('share')`; drop to the `sql` template if Drizzle cannot express it.
- **`runs.complete`** receives `answerCount` and `lastAnswerAt` (the count and latest `updated_at` of the answers the scores were computed from, read by `runs.get`). One `db.batch`: (0) `SELECT id FROM tool_run WHERE id AND user_id AND status = 'in_progress' FOR UPDATE`, which takes the row lock before anything is checked; (1) `UPDATE tool_run SET status = 'completed', scores, completed_at, updated_at WHERE id AND user_id AND status = 'in_progress' AND (SELECT count(*), max(updated_at) FROM tool_run_answer WHERE run_id = $run) = ($answerCount, $lastAnswerAt)`; (2) `INSERT INTO report (run_id) SELECT id FROM tool_run WHERE id AND user_id AND status = 'completed' ON CONFLICT (run_id) DO NOTHING`; (3) SELECT run and report. If the update hit zero rows and the run is still `in_progress`, return `answers_changed` (the caller scores again). **Why step (0) is required:** Postgres runs each statement in a batch on its own snapshot, and when an `UPDATE` waits on a row lock it rechecks only that row, not a subquery on another table. Without step (0), a `complete` that waits behind a `saveAnswer` still counts the old answers, matches the old fingerprint, and completes a run that now holds a newer answer. With step (0), the lock is taken first, a concurrent `saveAnswer` either commits before it (and step (1) then sees the new answer and returns `answers_changed`) or waits behind it (and then finds the run completed and changes nothing).
- **`runs.start` and `runs.resume`** are one `db.batch`: (1) `UPDATE tool_run SET status = 'paused' WHERE conversation_id = $c AND user_id = $user AND status = 'in_progress' AND id <> $target RETURNING id`; (2) the insert (start) or `UPDATE ... SET status = 'in_progress' WHERE status = 'paused'` (resume), guarded by conversation ownership; (3) SELECT. The partial unique index still backs AC-3 against races; a `23505` on it maps to a retry (up to 3 attempts in total, because with three or more parallel writers a loser can lose twice), then `run_in_progress`.
- **`runs.startFrom`** requires the old run to be `completed`, to have a non null `conversation_id` (else `no_conversation`), and its `tool_version` to equal the registry's current version (else `version_changed`: the assistant starts a fresh run and offers the old answers through the tool layer, which revalidates them against the new schema). The batch pauses any active run, inserts the new run with `based_on_run_id`, and copies answers with `INSERT ... SELECT` keeping each `source`.
- **`messages.append`** is one `db.batch`: (1) `UPDATE conversation SET last_message_at = GREATEST(last_message_at, now()), updated_at = now() WHERE id = $c AND user_id = $user RETURNING id` (this is the ownership signal: zero rows means `not_found`); (2) a multi row `INSERT INTO message (...) SELECT v.* FROM (VALUES ...) v JOIN conversation c ON c.id = $c AND c.user_id = $user ON CONFLICT (id) DO UPDATE SET parts = excluded.parts, metadata = excluded.metadata, updated_at = now() WHERE message.conversation_id = excluded.conversation_id`. The `WHERE` stops a client supplied id from touching another conversation's message; the update keeps parts the AI SDK adds when it continues a message (answer card results). Written with the `sql` template.
- **`conversations.open`** (AC-10) and **`runs.get` / `runs.getActive`** are one `db.batch` of selects (one HTTP round trip, one consistent snapshot): the owned conversation (empty result means `not_found`), the message page, and `listForConversation`'s query.
- **`conversations.delete`** is one `db.batch`: `UPDATE tool_run SET status = 'abandoned' WHERE conversation_id = $c AND user_id AND status IN ('in_progress', 'paused')`, then `DELETE FROM conversation WHERE id AND user_id`. Completed runs and reports survive with `conversation_id` null.
- **`reports.claim`** updates `SET status = 'generating', attempts = attempts + 1, updated_at = now() WHERE run_id = $run AND attempts < 3 AND (status IN ('pending', 'failed') OR (status = 'generating' AND updated_at < now() - interval '10 minutes'))` (mind the parentheses), joined to `tool_run` for ownership, `RETURNING attempts`, then a SELECT to pick the error. **`markReady` and `markFailed`** add `AND status = 'generating' AND attempts = $attempt`, so an older, reclaimed attempt gets `stale_attempt` and its result is dropped. `markFailed` runs on the failure path, so it never throws on an error that does not fit the error schema: it stores a fixed `{ kind: "unknown" }` error and logs `report_error_invalid`, so the report still leaves `generating` and the retry stays available.
- **`usage.record`** inserts `ON CONFLICT (call_key) DO NOTHING` and sets `user_id` with `(SELECT id FROM "user" WHERE id = $userId)`, so a user deleted or linked mid stream yields null instead of a foreign key error. It never throws on a missing user.
- **`users.linkGuest`** is one `db.batch` of `UPDATE <table> SET user_id = $new WHERE user_id = $guest RETURNING id` for every user owned table that exists (in #3: `conversation`, `tool_run`, `ai_usage`). It is idempotent (a second call moves nothing). **The `onLinkAccount` hook must let any error propagate** (no try and log), so Better Auth aborts before deleting the anonymous user. Features #9, #16, #17, #18 each add their table (profile: read both profiles before the batch, merge in a pure function, then the batch upserts the merged facts guarded by the guest profile's `updated_at` and deletes the guest profile).
- **Writes after a link**: `onFinish` and the report step resolve the owner with `conversations.ownerOf` or `runs.ownerOf` (`SELECT user_id FROM conversation WHERE id = $c`, or the same on `tool_run`), not from the session captured when the stream started, then call the query function with that owner. A stream that started as a guest and finishes after sign up still saves. Passing the stale guest id instead loses data: `messages.append` returns `not_found` and `usage.record` stores a null owner, because Better Auth has deleted the guest by then. The helpers take no `userId` on purpose (the caller has no trustworthy owner yet), so they are server only and must never be reachable from client input; the conversation or run id they take comes from the server's own stream context.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| any user facing query | `userId` | Better Auth session on the server (`auth.api.getSession`), never client input |
| `onFinish` and report step writes | owner `userId` | `conversation.user_id` via `conversations.ownerOf` (or `tool_run.user_id` via `runs.ownerOf`), read at write time |
| `runs.start` | `toolId`, `toolVersion` | the tool module from `tools/registry.ts` (contract in feature #5) |
| `runs.saveAnswer` | `questionId`, `value` | the tool module's question list and its Zod schema (feature #5) |
| `runs.saveAnswer` | `source` | the assistant layer, by how the answer was obtained (feature #6) |
| `runs.complete` | `scores` | the tool's pure scoring function over the answers from `runs.get` (feature #5) |
| `runs.complete` | `answerCount`, `lastAnswerAt` | derived from the same `runs.get` answers the scores were computed from |
| `runs.startFrom` | copied answers | `tool_run_answer` rows of `previousRunId`, keeping their `source`; new run gets the same `tool_id`, the same `tool_version`, and `based_on_run_id` |
| `reports.claim` | `attempts`, staleness cutoff, cap | `report.attempts`; constants in `src/db/queries/reports.ts`: 10 minutes (twice the 300 s `maxDuration` in spec 0001), max 3 attempts |
| `reports.markReady` | `content`, `model`, `attempt` | the tool's report step (feature #5/#7); model id from `src/assistant/models.ts`; `attempt` from the claim |
| `reports.markFailed` | `error.kind`, `error.message` | the report step maps the AI SDK error to a kind; message is a fixed safe text per kind |
| `messages.append` | message `id` | `newId()` via AI SDK `generateId` (client and server); Zod checks it is a uuid at the route |
| `messages.append` | order | `message.seq` (identity), assigned in insert order |
| `messages.append` | `last_message_at` | database `now()` |
| `messages.listRecent`, `conversations.list` | cursors | opaque base64 of `seq` (messages) or `last_message_at` as text plus `id` (conversations) |
| `usage.record` | `callKey` | `<assistant message id>:chat`, `<run id>:report:<attempt>`, `<conversation id>:title` |
| `usage.record` | token counts | AI SDK 7 `usage` in `onFinish`: `inputTokens`, `outputTokens`, `inputTokenDetails.cacheReadTokens`, `inputTokenDetails.cacheWriteTokens` (missing values are 0) |
| `usage.record` | `purpose` | the call site (chat route, report step, title step, extraction) |
| `usage.record` | `costUsd` | `src/lib/ai-cost.ts` price table times the token counts |
| `users.linkGuest` | `guestUserId`, `newUserId` | Better Auth `onLinkAccount({ anonymousUser, newUser })` |
| profile merge (#9) | winning fact | the fact with the later `updatedAt`, per key |
| `conversation.title` | title | decided in feature #14 (null until then) |
| `consultation.timezone` | client timezone | the browser's `Intl` timezone sent with the booking (feature #16) |

### Key invariants

- Every row a user owns reaches `user.id` through `user_id` or a cascading parent. **Any new user owned table must be added to `users.linkGuest` and must cascade (or SET NULL, if it is a business record) on user delete.** A test reads every foreign key to `user.id` from `information_schema` and fails if a table is neither in `linkGuest` nor on an explicit exclusion list.
- At most one `in_progress` run per conversation (partial unique index). Only `in_progress` runs accept answers.
- `completed` runs always have `scores` and `completed_at`; their scores match the answers they were computed from; nothing updates a completed run's answers or scores.
- One answer per `(run_id, question_id)`; one report per run; at most 3 report attempts per run.
- `ready` reports always have `content`; only the latest claim may write a report's result.
- App table ids are UUID v7 from `newId()`; client supplied message ids are uuids.
- Schema changes after this spec are additive only (AC-12); anything else routes back through `/architect`.

### Security model

- **Compliance scope**: Nigeria Data Protection Act 2023 and GDPR. Stored personal data: emails and names (Better Auth), business answers and reports, chat content, later booking contact details (name, email, phone) and uploads. Region: Neon Frankfurt (spec 0001).
- **Ownership**: a user reads and writes only their own rows. Enforced in the query layer: `userId` always comes from the server session (or, for `onFinish` writes, from the owning row), every query filters by it, and ids in URLs are checked through that filter. No Postgres row level security (one app, one database role).
- **Server only functions** (`reports.markReady`, `reports.markFailed`, `usage.record`, `users.linkGuest`) take no client input for ownership and are only called from server code paths.
- **Guest to account**: re-pointing happens inside Better Auth's `onLinkAccount`, which runs only after a successful sign up or sign in, and a failure aborts the link rather than deleting the guest.
- **Erasure**: deleting a user cascades every owned row; `ai_usage` keeps cost rows with no user link and no content; `consultation` (from #16) keeps the booking BeamX needs with `user_id` null, and its run links are removed. Its retention period is set by #18. Blobs (#17) are deleted in code before the row, since cascades cannot reach Vercel Blob.
- **Report errors** store a kind and a fixed safe message only, never prompts, stack traces, or client data.
- **Audit**: consent is durably recorded in `consent` (#18). Guest link and user delete events are written as structured log lines (`event`, ids, row counts, no content). A durable access audit table arrives with the deferred staff console.
- **Not stored**: IP addresses (rate limits live in Upstash Redis), raw files' contents in the database, secrets of any kind.

### Configuration required

App env (through `src/lib/env.ts`, all already named in spec 0001; this feature creates `env.ts` and `.env.example` with these first):
- `DATABASE_URL`: Neon pooled connection for the app.
- `DATABASE_URL_UNPOOLED`: direct connection, used by `drizzle-kit migrate` only.
- `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`: needed for the minimal Better Auth server config.

CI only (GitHub, not app env):
- `NEON_API_KEY` (secret) and `NEON_PROJECT_ID` (variable): let the workflow create and delete a throwaway Neon branch per run. The test step gets that branch's connection strings as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

Prerequisite: the Neon project in `aws-eu-central-1` exists with a dev branch, and the API key above is created in the Neon console.

### Critical test scenarios

All run with Vitest against a real Neon branch using the production `neon-http` driver. Each test creates its own users with `newId()`, so parallel test files can share one branch.
- Happy path: anonymous user → conversation → messages → run → answers → complete → claim → ready; `conversations.open` reads it all back in one batch, verifies **AC-1**, **AC-10**.
- Answer upsert: save the same question twice, then save to a completed run, verifies **AC-2**, **AC-4**.
- Late answer race: `saveAnswer` and `complete` in parallel, repeated several times with fresh runs, never leave an answer in a completed run (either `complete` wins and the answer is refused, or the answer wins and `complete` returns `answers_changed`), and a stale `answerCount` returns `answers_changed`, verifies **AC-2**, **AC-4**.
- Pause and resume: start Luna, start Stellar in the same chat (Luna paused), resume Luna (Stellar paused); two parallel starts never leave two active runs, verifies **AC-3**.
- Reports: two parallel claims (one winner); stale reclaim; the reclaimed attempt's `markReady` gets `stale_attempt`; a fourth claim gets `attempts_exhausted`, verifies **AC-5**.
- Messages: re-appending the same id with new parts updates it; an id from another conversation is not touched; order follows `seq`, verifies **AC-1**, **AC-8**.
- Change answers: `runs.startFrom` on a completed run copies answers with their sources and leaves the old run and report unchanged; a version mismatch returns `version_changed`, verifies **AC-4**.
- Guest link: guest with conversations, runs, and usage links to a new user; all rows move. A forced failure in `linkGuest` aborts the link and the guest and data remain. A `usage.record` with a deleted user id stores null, verifies **AC-6**.
- Link coverage: every foreign key to `user.id` is covered by `linkGuest` or excluded on purpose, verifies **AC-6**, **AC-7**.
- Deletion: delete a user; owned rows are gone, `ai_usage` rows remain with null `user_id`, verifies **AC-7**.
- Auth/permission: user B calls every read and write function with user A's ids and gets `not_found`, with A's rows unchanged, verifies **AC-8**.
- Tool versions: runs with two `tool_id`s and versions store and read back without schema changes, verifies **AC-9**.
- Migrations: CI applies all migrations to a fresh branch before tests and `drizzle-kit check` reports no drift, verifies **AC-11**.

## Build plan

Tracer Bullet: first stand up one real thread from the auth tables through to a saved report (proven by one integration test on a real Neon branch), then thicken the query layer one strand at a time. Later tables are not built here; their features add them per the reserved table above.

**Milestone 1: Database and auth foundation**
1. Install pinned `drizzle-orm@0.45.x`, `drizzle-kit`, `@neondatabase/serverless`, `better-auth`, `uuid`, `zod`; confirm the Better Auth Drizzle adapter works with Drizzle 0.45 (spec 0001 follow-up), satisfies **AC-11**
2. Create `src/lib/env.ts` (Zod, `SKIP_ENV_VALIDATION` support) with the four vars above, `.env.example`, and `src/lib/result.ts`, satisfies **AC-11**, **AC-8**
3. Create `src/db/id.ts` (`newId()`), `src/db/client.ts` (Drizzle on `neon-http`), and `drizzle.config.ts` (reads `DATABASE_URL_UNPOOLED` through `env.ts`, migrations in `src/db/migrations/`), satisfies **AC-1**, **AC-11**
4. Create the minimal Better Auth server config in `src/auth/` (Drizzle adapter, `anonymous` plugin, `onLinkAccount` stub that lets errors propagate) and generate `src/db/schema/auth.ts` with its CLI. **Spike first: confirm the generated `user.id` is a `uuid` column.** Try `newId` as `generateId` first; if the CLI then emits `text`, switch to Better Auth's built in uuid option (plain random uuids for auth tables) rather than hand editing generated files. Record the outcome in `src/auth/AGENTS.md`. No `/api/auth` route or UI (feature #7 and #8), satisfies **AC-1**, **AC-6**

**Milestone 2: Thin thread end to end**
5. Write `src/db/schema/chat.ts`, `runs.ts`, `usage.ts` with every enum, column, index, and CHECK above; generate and commit the first migration, satisfies **AC-1**, **AC-3**, **AC-9**, **AC-12**
6. Add `db:generate`, `db:migrate`, and `db:check` scripts; set the Vercel build command to `pnpm db:migrate && pnpm build`, satisfies **AC-11**
7. Set up Vitest (an `integration` project for DB tests) and a test helper that creates an anonymous user with `newId()`; write the happy path thread test using minimal versions of `conversations.create`, `messages.append`, `runs.start`, `runs.saveAnswer`, `runs.complete`, `reports.claim`, `reports.markReady`, `conversations.open`, satisfies **AC-1**

**Milestone 3: Thicken the query layer**
8. Finish `conversations` (`list`, `open`, `delete`) and `messages` (batched upsert append, `seq` pagination, opaque cursors), with ownership filters, satisfies **AC-8**, **AC-10**
9. Finish `runs` (`saveAnswer` with `FOR SHARE`, `complete` with a row lock and answer fingerprint, `start`/`pause`/`resume`, `startFrom`, `abandon`, `get`, `getActive`, typed errors with trailing selects), satisfies **AC-2**, **AC-3**, **AC-4**
10. Finish `reports` (claim with cap and stale reclaim, attempt guarded `markReady`/`markFailed`, `listForConversation`) and `usage.record` (`call_key`, null tolerant user), satisfies **AC-5**, **AC-6**, **AC-7**, **AC-10**
11. Tests: answer upsert, late answer race, pause and resume, reports, messages, change answers, tool versions, and the cross user `not_found` suite, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**, **AC-9**

**Milestone 4: Guest link, deletion, CI**
12. Implement `users.linkGuest` as one `db.batch` and wire it into `onLinkAccount` (errors propagate), with a structured log line; tests for success, forced failure, and the foreign key coverage check, satisfies **AC-6**, **AC-7**
13. Deletion cascade test (owned rows gone, `ai_usage` detached), with a structured log line on delete, satisfies **AC-7**
14. CI: add a job that creates a Neon branch (Neon's GitHub action), runs `db:check`, `db:migrate`, then the integration tests, and deletes the branch; add `NEON_API_KEY` and `NEON_PROJECT_ID` in GitHub. `db:check` only checks the migrations folder (snapshot versions, collisions, journal order), not the schema, so drift is caught by a separate step in the `check` job: run `pnpm db:generate` (no database needed) and fail if anything under `src/db/migrations` changes, satisfies **AC-11**

## Consequences

**Positive**:
- One owner column per row makes guest to account carryover a single batch and erasure a single delete.
- Real constraints (partial unique, CHECKs, compare and set, row locks) stop double runs, double reports, stale writers, and edits to frozen runs at the database, not just in code.
- JSONB for tool owned payloads means new tools and tool versions need no migration.
- Integration tests on a real Neon branch exercise the same driver and batch behaviour as production.

**Negative / tradeoffs**:
- `neon-http` has no interactive transactions. Multi step writes must be expressible as one `db.batch` of independent statements; a future write that needs read then decide then write inside a transaction needs a WebSocket `Pool` client added for that path.
- Several query functions (`messages.append`, `saveAnswer`, `claim`) need hand written SQL through Drizzle's `sql` template, so they lose some type safety and need their own tests.
- JSONB payloads are not checked by the database. A bug in a tool's Zod schema can store bad shapes; reads must always validate and degrade to a friendly card.
- Every new user owned table carries a duty: add it to `users.linkGuest` and set its delete rule. The coverage test catches a miss, but only if the new table has a real foreign key to `user`.
- Frozen runs mean more rows: every answer change copies the run's answers. Paused runs can pile up in a chat; the UI must show them clearly.
- `ai_usage.cost_usd` stores a derived value on purpose (price at call time); changing the price table does not rewrite history.
- Migrations run in the Vercel build with no lock: two concurrent builds can race, and a failed deploy can leave the schema ahead of the running code. Accepted because migrations are additive only (AC-12), so older code keeps working against a newer schema.
- Compliance (NDPA, GDPR): audit logging of compliance actions is required. Consent is durable in the database, but guest link and deletion events are only log lines in Vercel logs (limited retention) until a durable audit table is added. This is an accepted gap for launch scale and must be closed before the staff console exists.
- CI now depends on Neon's API and adds a branch create and delete per PR (a few seconds, within Neon's branch limits).

**Neutral**:
- Better Auth's tables use uuid ids, so its generated schema differs from its defaults; regenerate with the same config after Better Auth upgrades.
- Message ids from the client are uuids, so the chat client must pass `newId` as the AI SDK `generateId` (feature #7).
- Spec 0001's "Guest data retention" purge relies on these cascades; the purge job itself is built by feature #8.

## Follow-up

- [ ] Feature #5 (tool module contract) must define, per tool version, Zod schemas for answer values, `scores`, and report `content`, the question ids these tables store, and how the tool layer revalidates answers carried across a version change.
- [ ] Feature #6 (assistant brain) decides how the assistant offers to pause, resume, or abandon a run, and how it shows paused runs.
- [ ] Feature #9 defines the profile key catalog and adds `business_profile` plus its merge step to `users.linkGuest`.
- [ ] Features #16, #17, #18 add their reserved tables exactly as sketched here, extend `users.linkGuest`, and extend the link and deletion tests.
- [ ] Feature #17 deletes a user's blobs before the user row in every deletion path (account delete and the 30 day guest purge).
- [ ] Feature #18 sets the retention period for `consultation` contact details after an account deletion, and discloses it.
- [ ] Before the staff console (deferred), add a durable audit table for staff access, guest links, and deletions.
- [ ] Create `NEON_API_KEY` and set `NEON_PROJECT_ID` in GitHub before milestone 4.
