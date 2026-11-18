# Review, feat/data-model, 2026-11-18

**Reviewed by**: claude-opus-5-5 (author on a different model, not recorded)
**Scope**: 41 files (lock file and drizzle meta snapshots excluded from the count), branch vs main
**Verdict**: Changes requested

## Summary
The branch builds spec 0002's data foundation: Zod env, UUID v7 ids, Drizzle schema plus first migration, a typed query layer (conversations, messages, runs, reports, usage, users), the Better Auth anonymous link hook, and Neon branch integration tests in CI. The concurrency work is careful and matches the spec closely: compare-and-set transitions with trailing selects, `FOR SHARE` / `FOR UPDATE` pairing for the late answer race, attempt-guarded report writes, and retries on the partial unique index. Two gaps stop it from fully meeting its own ACs: the CI "drift" check does not detect drift (AC-11), and the "writes after a link" rule (AC-6, last clause) exists only as inline test code, so the first `onFinish` caller has no correct path through the query layer.

## Major

### 🟠 `drizzle-kit check` does not detect schema vs migration drift, `.github/workflows/ci.yml:74`
**Problem**: The step comment says it "fails when the schema and the committed migrations drift apart", but `drizzle-kit check` (0.31.11, `checkHandler` in `bin.cjs`) only checks the migration folder: snapshot version, malformed snapshots, parent collisions, and journal order. It never compares `src/db/schema/*` to the snapshots. You can edit a schema file (add an index, a CHECK, a default) without running `db:generate`, and CI stays green.
**Why it matters**: AC-11 says "CI fails if the schema and the committed migrations drift". If someone forgets `db:generate`, the next deploy's `db:migrate` never applies the change. Production then runs without the constraint the code and tests assume. Integration tests do not catch it either, because they run against the migrated schema, not the TS schema.
**Suggested fix**: Keep `db:check` for collisions. Also add a step that runs `pnpm db:generate` (it needs no database; `SKIP_ENV_VALIDATION=1` or the branch env is enough) and then fails on any change or new file under `src/db/migrations` (for example `git status --porcelain src/db/migrations` must be empty). Put it in the `check` job so fork PRs get it too.

### 🟠 No query layer path for "writes after a link" (AC-6), `src/db/queries/usage.ts:33`, `src/db/queries/messages.ts:76`
**Problem**: The spec says `onFinish` and the report step read the owner from the conversation or run row at write time. In this branch, that lookup exists only as an inline `db.select` in `link.int.test.ts:124-128`. `messages.append` needs a `userId` that owns the conversation. `usage.record` resolves `user_id` only from the passed `userId`. Once Better Auth deletes the anonymous user after the link, that id no longer exists. So the obvious future call (the session user id captured when the stream started) has two outcomes:
- `messages.append` returns `not_found`, and the assistant's reply is never saved.
- `usage.record` stores `user_id = null`, so the cost is no longer attributed to the user. That breaks per-user spend views, and with them the "signed in users continue" spend-cap logic.

**Why it matters**: AC-6 counts as passing only because the test does the resolution itself. Features #6 and #7 will write `onFinish` against this API. Nothing in the layer steers them to the right owner, and a mistake here silently loses data.
**Suggested fix**: Ship the rule inside the layer:
- In `usage.record`, resolve the owner as `COALESCE((SELECT user_id FROM conversation WHERE id = $c), (SELECT user_id FROM tool_run WHERE id = $r), (SELECT id FROM "user" WHERE id = $u))`.
- Add a server-only helper, for example `conversations.ownerOf(conversationId)` (or a server-only `messages.appendAsOwner`), that `onFinish` calls instead of passing the session id.
- Point the AC-6 test at those functions, and add the helper to the spec's API surface table.

## Minor

### 🟡 `markFailed` throws on a bad error shape, so a report stays stuck in `generating`, `src/db/queries/reports.ts:113`
**Problem**: `reportErrorSchema.parse(error)` throws a `ZodError` when the input does not match, for example a `message` over 300 characters. This function runs on the failure path of the report step.
**Why it matters**: When the error handler itself throws, the report stays in `generating` until the 10 minute stale reclaim, and the original failure kind is lost. This also goes against the project rule that expected failures return typed results.
**Suggested fix**: Use `safeParse`. On failure, store a fixed `{ kind: "unknown", message: "<fixed safe text>" }` and log, so the failure path itself never fails.

### 🟡 Malformed ids or cursors throw instead of returning `not_found` / `invalid_cursor`, `src/db/queries/messages.ts:88`, `src/db/queries/conversations.ts:81`
**Problem**: Every query passes ids straight to uuid columns or `::uuid` casts. A non-uuid id (for example a mangled URL segment) raises Postgres `22P02`, which surfaces as a thrown error. The same happens with a list cursor that base64-decodes to a well-formed `[string, string]` but holds a bad timestamp or uuid (`conversations.ts:81`).
**Why it matters**: AC-8 promises a typed `not_found`. Today, a junk URL gives the "try again" card instead of "not found", unless every route remembers `z.uuid()`.
**Suggested fix**: Either validate ids with `z.uuid()` at the top of each user-facing query function (cheap, one place), or state clearly in the module docs that callers must Zod-check ids. In `decodeListCursor`, also check the cursor fields with `z.iso.datetime({ offset: true })` / `z.uuid()`.

### 🟡 Answer fingerprint can miss an update that commits late, `src/db/queries/runs.ts:255`, `src/db/queries/runs.ts:290`
**Problem**: The fingerprint is `(count, max(updated_at))`. The upsert sets `updated_at = now()`, which is the transaction start time. Take two concurrent `saveAnswer` calls on the same run: A updates an existing question and B saves another. If B commits first and A commits later with an earlier `now()`, a `runs.get` taken between the two commits sees `max = B`. After A commits, the count is the same and the max is still B. So `complete` accepts scores computed from A's old value. This is narrow (it needs a double submit plus a read, score, and complete inside one commit window), and I have not reproduced it.
**Why it matters**: It is a hole in AC-4's "scores are accepted only if they were computed from the run's current answers".
**Suggested fix**: Use a content fingerprint instead of timestamps, for example `md5(string_agg(question_id || '=' || value::text, ',' ORDER BY question_id))`. Return it from `runs.get` and compare it in `complete`. Alternatively, add a run-level counter bumped by `saveAnswer`'s existing `UPDATE tool_run`, which is serialized by the row lock and is an additive column.

### 🟡 Duplicate ids within one `append` call throw, `src/db/queries/messages.ts:104`
**Problem**: If two entries in `messages[]` share an id, Postgres raises `21000` ("ON CONFLICT DO UPDATE command cannot affect row a second time"), and the whole batch throws.
**Why it matters**: The AI SDK should not send duplicates, but a client retry or a merge bug would then lose the whole save as an unexpected 500.
**Suggested fix**: Dedupe by id before building `VALUES`, keeping the last entry, or document the precondition and enforce it in the route's Zod schema.

### 🟡 Production migration step is not in the repo, `package.json:7`
**Problem**: Build step 6 says "set the Vercel build command to `pnpm db:migrate && pnpm build`". There is no `vercel.json`, and `build` is plain `next build`. If the setting lives only in the Vercel dashboard, nothing in the repo shows or enforces it.
**Why it matters**: A missed setting means deploys never migrate, and the code runs against an old schema.
**Suggested fix**: Add a `vercel.json` with `buildCommand`, or a `vercel-build` script, so the step is versioned. Otherwise, at least confirm the dashboard setting and note it in AGENTS.md.

### 🟡 Test gaps on a few error branches and the real Better Auth flow, `src/db/queries/ownership.int.test.ts:20`, `src/db/queries/link.int.test.ts:104`
**Problem**: Four gaps:
- The cross-user suite skips `runs.complete(b, …)`, which has no direct cross-user test.
- `startFrom`'s `no_conversation` branch is untested.
- "the hook moves rows for a real link" calls `linkGuestAccount` directly, so nothing drives Better Auth (anonymous sign-in, then sign-up) to prove the abort-before-delete contract. I checked better-auth 1.7.25's `anonymous/index.mjs`: it awaits `onLinkAccount` before `deleteUser`, so the behavior is right today, but an upgrade could change it unnoticed.
- No unit tests exist for the pure helpers (`decodeCursor`, `decodeListCursor`, `isUniqueViolation`, `toPage`).

**Suggested fix**: Add the two branch cases. Add one integration test through `auth.api` (anonymous sign-in, then email sign-up with the anonymous cookie, with `linkGuest` made to fail by a missing table or a spy) asserting that the guest row survives. Add small unit tests for the cursor codecs, including malformed input.

## Nits
- ⚪ `.github/workflows/ci.yml:29`: the comment says the test step "is skipped until a test script exists", but the script now exists. Update the comment.
- ⚪ `src/db/queries/runs.ts:41`: the doc comment says "the loser retries once", but the loop makes 3 attempts. Align it with the spec ("up to 3 attempts in total").
- ⚪ `src/db/queries/runs.ts:202`: in `startFrom`, the pause statement runs even when the guarded insert matches nothing (a race with conversation deletion). The result is that a run gets paused while `not_found` is returned. Consider guarding the pause with `EXISTS` on the previous run's conditions.
- ⚪ `src/db/queries/runs.ts:265`: `saveAnswer` returns `{ questionId, source }` built from its inputs, not the stored answer row the spec lists. Return the row (`RETURNING *`) so callers get `updatedAt` for the fingerprint.
- ⚪ `src/lib/env.ts:18`: in skip mode, missing vars become `""`. `neon("")` then fails at import with an unclear message if code touches the DB during `next build`. Consider a clearer failure, or a lazy client.

## Strengths
- The concurrency design is the real thing, not a sketch. The `FOR UPDATE`-first batch in `complete`, paired with `FOR SHARE` in `saveAnswer`, is correct under READ COMMITTED, and it is tested with a repeated parallel race. Report claims use compare-and-set with attempt-guarded writes, and stale reclaim is tested end to end.
- The FK coverage test (`link.int.test.ts:145`) reads `pg_constraint`, so a future user-owned table cannot slip out of `linkGuest` or block deletion unnoticed.
- The house style holds: typed `Result` errors, ids passed as bound parameters (no injection surface), `env.ts` as the only `process.env` reader, `mode: "string"` timestamps for cursors, and every FK used by a cascade is indexed.
- `onLinkAccount` correctly lets errors propagate. I checked this against the installed better-auth source.

## Test coverage
Strong for a data layer. The integration tests against a real Neon branch cover AC-1 to AC-10: the happy path, upsert, the late answer race, pause and resume including parallel starts, the report lifecycle including stale reclaim and exhaustion, message upsert and cross-conversation safety, pagination, startFrom, link, the FK coverage check, the deletion cascade, and the cross-user suite. Gaps:
- The AC-11 drift check is ineffective (Major above).
- AC-6's "after link" clause is tested only through test-local code (Major above).
- `complete` cross-user and `no_conversation` are untested.
- No test goes through Better Auth itself.
- The pure helpers have no unit tests.
