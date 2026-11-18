# Verify: data model · spec 0002 · updated 2026-11-18
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run the database steps against a fresh throwaway Neon branch (never `production` or `dev`): load its connection strings into `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for the shell, then run the commands.

## Commands
- [ ] `pnpm db:migrate` on an empty branch → migrations apply cleanly; the 10 tables exist with their constraints → AC-11
- [ ] `pnpm test:integration` → every test passes → AC-1 to AC-10
- [ ] With no schema change, `pnpm db:generate` then `git status --porcelain src/db/migrations` → empty output → AC-11
- [ ] In a throwaway worktree, edit a schema column (for example add a default), then run `pnpm db:generate` → a new migration file appears, so the CI "Fail on schema drift" step would fail → AC-11
- [ ] Latest CI run on the PR → both the `check` job (including "Fail on schema drift") and the `database` job pass → AC-11

## Runtime / scratch script
- [ ] Anonymous Better Auth sign in, then create a conversation, append messages, start a run, save answers, complete, claim and mark a report ready; a separate process reads it all back by id → AC-1
- [ ] Save the same question twice → one row with the latest value and source; each save is one HTTP round trip; saving to a completed run returns `not_found_or_not_in_progress` → AC-2
- [ ] Start a run while one is active, and run resume and start in parallel → at most one `in_progress` run per conversation → AC-3
- [ ] Complete with a stale answer count → `answers_changed`; `startFrom` → new run in the same conversation with copied answers, old run and report untouched → AC-4
- [ ] Two parallel claims → one winner; fail, retry, age the report 11 minutes, reclaim → the old attempt gets `stale_attempt`; a 4th claim → `attempts_exhausted`; scores still readable → AC-5
- [ ] `markFailed` with a message over 300 characters → no throw; the report is `failed` with `{ kind: "unknown" }`, and a retry claim succeeds → AC-5
- [ ] Real Better Auth sign up carrying the guest cookie (scratch instance with email sign up enabled) → guest rows move to the new user and the guest row is gone; a forced link failure keeps the guest and its data → AC-6
- [ ] After a link and the guest's deletion, `conversations.ownerOf` and `runs.ownerOf` return the new user; append and usage record with that owner land on the new user; the stale guest id gets `not_found` → AC-6
- [ ] Delete the account → every owned row is gone; its `ai_usage` rows remain with `user_id` null → AC-7
- [ ] A second user asks for the first user's conversation, run, report, messages, and saves an answer → typed `not_found` every time → AC-8
- [ ] Start a run with a new `tool_id` (for example `luna`, version `3`) → stored with no migration → AC-9
- [ ] `conversations.open` → one round trip returns the conversation, messages oldest first within the page, and runs with reports → AC-10
- [ ] On a throwaway branch, add the reserved tables, `tool_run_answer.file_id`, and a new enum value → applies with no change to existing columns → AC-12

## Acceptance-criteria coverage
- AC-1 runtime step 1 · AC-2 step 2 · AC-3 step 3 · AC-4 step 4 · AC-5 steps 5 and 6 · AC-6 steps 7 and 8 · AC-7 step 9 · AC-8 step 10 · AC-9 step 11 · AC-10 step 12 · AC-11 commands 1, 3, 4, 5 · AC-12 step 13
