# 0002. Data model: rationale

## Context

> ⚠️ Premise note: This spec designs tables for features that have no spec yet (profile #9, bookings #16, uploads #17, consent #18), and the tool contract (#5) that defines the JSONB payloads is also undecided. Designing tables ahead of their features risks guessing wrong. The guard is that those tables are built only by their own features, only additively, and those specs may refine column details as long as the ownership rules here hold. The payload shapes are deliberately left to #5 and #9.

The workspace stores guests' and clients' chats, the answers they give each BeamX tool, the deterministic scores, and the AI written reports, then lets them talk about those reports later. Every later slice (accounts, profile, the other three tools, follow up chat, history, PDFs, bookings, uploads, privacy) builds on these records, and the scope's bar is that none of them should need a breaking migration.

Forces:
- **Guest first**: a guest is a real Better Auth user (`anonymous` plugin). On sign up their work must move to the new account before Better Auth deletes the anonymous user.
- **Four different tools, more later**: Stellar has 10 questions, Luna 60+ across 9 areas with pause and resume. Questions, scores, and reports differ per tool and will change over time, while old reports must keep rendering.
- **Erasure**: NDPA 2023 and GDPR require full deletion on request, and unclaimed guests are purged after 30 days (spec 0001). BeamX still needs its own record of bookings.
- **Latency**: Frankfurt is 150 to 250 ms from Nigeria, and `neon-http` costs one HTTPS round trip per query or batch. Each answer card tap is a write.
- **Stack fixed by spec 0001**: Neon Postgres, Drizzle 0.45, Better Auth, AI SDK 7 messages, functional style, typed results.

## Options considered

### Option 1: Relational core with JSONB for tool owned payloads (chosen)

Real tables and foreign keys for every entity; JSONB only for payloads whose shape is owned by a tool, the AI SDK, or the profile catalog.

**Pros**: cascades and constraints enforce ownership, single active run, and frozen runs in the database; new tools need no migration; one owner column makes linking and deletion simple.
**Cons**: JSONB contents are only validated by the app; every new user owned table must remember to join the link batch.

### Option 2: Fully normalized per tool tables

Typed tables per tool (`stellar_answers`, `luna_answers`, typed score columns).

**Pros**: the database checks every field; easy SQL analytics per tool.
**Cons**: every new tool or question change is a migration, which breaks "add a tool by adding a folder" (spec 0001) and the no breaking migration bar; four times the schema to maintain.

### Option 3: Document per conversation

One JSONB document per conversation holding messages, runs, answers, and reports.

**Pros**: fewest tables, one read per chat.
**Cons**: every answer rewrites the whole document (slow over a long Luna run, races between concurrent writes); no constraints; listing reports across chats and the AI cost ledger become full scans. Relational data forced into a document store.

### Option 4: Separate owner table between users and data

Data hangs off an `owner` row; guests and accounts point to an owner, and linking moves one pointer.

**Pros**: linking a guest is a single update regardless of how many tables exist.
**Cons**: every query joins through `owner`; Better Auth deletes the anonymous user anyway, so the extra layer buys little over one batch of updates.

## Rationale

Option 1 fits the two hardest forces at once: tools change shape often (so their payloads must not be columns), while ownership, single active run, frozen completed runs, and one report per run are invariants that must hold even when the app has a bug, so they belong in the database. A plain `user_id` on each owned table keeps guest linking to one `db.batch` and erasure to one delete, which Option 4 would only make marginally simpler at the cost of a join on every read.

The finer calls, decided with the engineer:
- **One row per answer** so each card tap is one upsert, with a `source` for provenance (client, profile, chat, file). Runner up: a JSONB answer map on the run, rejected because concurrent taps would race on one row and provenance is lost.
- **Report in its own 1:1 table** so a failed report can be retried without touching the frozen run, and scored runs still show scores. Runner up: report columns on the run.
- **Frozen completed runs**; changing answers creates a new run prefilled from the old one. Every report always matches its answers.
- **UUID v7 from one app helper**: native uuid type, time ordered (compact indexes), unguessable in URLs, known before insert (needed for AI SDK message ids), independent of the Postgres version. Runner up: database `uuidv7()`, which needs PG 18 and would make Better Auth and the AI SDK wait for the database to assign ids.
- **`neon-http` with `db.batch`**: one HTTPS round trip per statement group matters more than interactive transactions, since every multi table write here (link, complete, append) can be written as independent statements. Runner up: WebSocket `Pool`, kept as the escape hatch.
- **Ownership in the query layer, not row level security**: one app and one database role; RLS would need per request JWT roles for Better Auth, a real cost for no new protection at this size.
- **Integration tests on a Neon branch per CI run** rather than PGlite, because PGlite is a different driver and would not exercise `db.batch` as production runs it.

Decided by the architect (not asked):
- `based_on_run_id` on `tool_run` to record which run a new one was prefilled from; cheap, and lets history show "updated answers". Runner up: no link.
- Stale report reclaim after 10 minutes (twice the 300 s function limit), so a killed function never leaves a report stuck. Runner up: a cron that resets stuck reports.
- Expected outcomes return typed results; infrastructure failures throw to the route edge. Wrapping every network error as a result in every query function would add noise for a case the route handles uniformly. Runner up: wrap everything.
- `messages.append` inserts with `ON CONFLICT (id) DO NOTHING` and checks ownership through the conversation, so a client supplied id can never overwrite another user's message.
- Keyset pagination (30 conversations, 100 messages per page): stable under inserts, unlike offsets.
- `ai_usage.cost_usd` stored at call time despite being derived, because prices change and the ledger must reflect what was actually spent.

### Cross check (2026-11-17)

An independent model review found six design bugs and ten unsettled details. The engineer approved every recommended fix:
- `saveAnswer` guards with `FOR SHARE`, and `complete` checks an answer fingerprint, so an answer cannot land in a completed run and scores always match their answers.
- `messages.append` updates parts for a repeated id (the AI SDK continues messages this way) while refusing ids from another conversation. A `seq` identity column orders the thread instead of clock time.
- `onLinkAccount` must let errors propagate, because a swallowed error lets Better Auth delete the guest and cascade away their data. Writes that finish after a link resolve the owner from the row.
- Report results carry the attempt number, so a reclaimed attempt cannot overwrite a newer one. Attempts are capped at 3 to bound AI spend.
- A `paused` run status was added now, so Luna's pause and resume survive switching tools. Adding it later would have meant rewriting the partial index and CHECK.
- A spike checks that Better Auth generates uuid user ids. If it cannot with v7, auth tables use plain random uuids, and the v7 rule covers app tables only.
- Smaller fixes: typed error mapping by constraint name, trailing selects in compare and set batches, one batch of reads for opening a chat, `conversations.delete` that abandons active runs, an idempotent `usage.record` via `call_key`, an `error.kind` enum, explicit `updated_at` in raw SQL, a test that every foreign key to `user` is covered by the link batch, and a `drizzle-kit check` drift check in CI.
