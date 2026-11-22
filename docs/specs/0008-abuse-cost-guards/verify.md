# Verify: Abuse & AI cost guards · spec 0008 · updated 2026-11-22 (milestones 1 to 4)
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: spend total and the guest spend cap at chat

### UI / manual
- [ ] As a guest, send a typed message with Upstash set and the real (or fake) model → the reply streams; Upstash shows `spend:<lagosDate>` grown by that call's `ai_usage.cost_usd` → AC-1
- [ ] Finish a Stellar report as a guest → `spend:<lagosDate>` grows by each report phase (and repair) cost as well as the chat turns; the sum matches `ai_usage` for the day → AC-1
- [ ] Set `AI_DAILY_SPEND_CAP_USD` very low (say `0.000001`), send one guest message, then another → the second gets the "We are busy right now" card with a Got it button, no AI call, nothing saved; Got it puts the text back in the composer → AC-2
- [ ] Same low cap, as a guest inside a run already started, tap an answer card → it goes through → AC-2
- [ ] Same low cap, claim a report already approved → every phase runs and the report is ready (the runner never blocks) → AC-11
- [ ] After the cap trips, Upstash holds `spend:tripped:<lagosDate>` (7 day expiry) and the logs show exactly one `spend_cap_tripped` line → AC-3
- [ ] Point `UPSTASH_REDIS_REST_URL` at a dead host and chat as a guest → the chat works, the logs show `limit_check_failed` with `limit: "spend"`, never a 500 → AC-9

### Commands
- [ ] `pnpm test src/lib/limits.test.ts src/lib/spend-cap.test.ts src/lib/client-ip.test.ts` → all pass → AC-1, AC-3, AC-9, AC-10
- [ ] `pnpm test src/assistant/chat-api.test.ts` → the "guest spend cap" cases pass (guest typed refused; taps, resends and signed in users pass) → AC-2

### Value sourcing
- [ ] Lagos date: a call at 22:59 UTC adds to today's key, one at 23:00 UTC adds to tomorrow's (`lagosDate` test, or check the key name in Upstash near Lagos midnight) → AC-10
- [ ] Guest or account: a guest session (`isAnonymous` true) is paused at the cap; an account session is not → AC-2
- [ ] Cost of a call: the amount added equals the `ai_usage.cost_usd` saved for that `callKey`; a duplicate `callKey` adds nothing → AC-1
- [ ] Today's spend: the cap check reads `spend:<lagosDate>`; setting that key by hand at or over the cap pauses guests at once → AC-2
- [ ] Resend: resending a saved message after the cap trips is not refused again → AC-2
- [ ] The numbers: changing each `LIMIT_*` and `AI_DAILY_SPEND_CAP_USD` in env changes the limit; an empty line falls back to the default → AC-10

## Acceptance criteria coverage (milestone 1)
- AC-1 · manual 1, 2 · value sourcing "cost of a call"
- AC-2 (chat part) · manual 3, 4 · chat-api tests · value sourcing "guest or account", "today's spend", "resend"
- AC-3 · manual 6 · spend-cap tests
- AC-9 · manual 7 · limits tests
- AC-10 · limits tests · value sourcing "Lagos date", "the numbers"
- AC-11 · manual 5
- AC-2 (Approve), AC-4 to AC-8: milestones 2 to 4 below

## Milestones 2 to 4: run approval, chat route limits, guest sign in cap

### UI / manual
- [ ] As a guest with Upstash set, start and approve 3 runs in one Lagos day → all 3 start; the 4th Approve gets "You've used today's free runs" below a one line reply, no credits held, the chip unchanged → AC-4
- [ ] Set `LIMIT_RUNS_PER_GUEST=1`, approve a run as a guest with too few credits → the short balance card shows and `limit:runs:user:<id>:<lagosDate>` is back to 0; a funded Approve then starts → AC-4
- [ ] As a guest, restart a completed run (change my answers) → counts as a run; resume a paused run → the counter does not move → AC-4
- [ ] Set `AI_DAILY_SPEND_CAP_USD` very low, then approve a new run as a guest → the "We are busy right now" card shows after the reply, nothing held, no run started; Got it hides only the card (the reply and the tap stay) → AC-2
- [ ] Same low cap, signed in (not anonymous) → Approve starts the run → AC-2
- [ ] Two browser tabs as the same guest at 2 runs of 3, tap Approve in both at once → exactly one run starts → AC-4
- [ ] Set `LIMIT_CHAT_PER_GUEST=2`, send 3 typed messages as a guest with no run → the 3rd gets "You've reached today's chat limit", no AI call, nothing saved; Got it puts the text back → AC-5
- [ ] Same limit, inside a run in progress, type a side question → it goes through; card taps always go through → AC-5
- [ ] Set `LIMIT_CHATS_PER_GUEST=1`, start a chat, then open "New chat" and send → "You've started a lot of chats today", and no new row in `conversation`; the first chat still works → AC-6
- [ ] Set `LIMIT_BURST_PER_USER=3`, send 4 messages within a minute (signed in or guest) → the 4th gets "You're sending messages fast", nothing saved → AC-7
- [ ] Set `LIMIT_GUESTS_PER_IP=1`, open a private window, send a first message, then another private window → the second gets "We couldn't start a new chat"; `POST /api/auth/sign-in/anonymous` answered `429 {"code":"guest_limit"}` and no new user row → AC-8
- [ ] Point `UPSTASH_REDIS_REST_URL` at a dead host, approve a run as a guest and sign in a new guest → both work, the logs show `limit_check_failed` (`runs_daily`, `guests_daily`, `burst_user`), never a 500 → AC-9
- [ ] Open `/design` → the Limit notices block shows all six cards; Got it dismisses each → AC-2, AC-5, AC-7

### Commands
- [ ] `pnpm test src/lib/limits.test.ts src/auth/guest-limit.test.ts src/components/workspace/chat-request.test.ts src/components/workspace/chat-view.test.ts` → all pass → AC-4, AC-6, AC-7, AC-8, AC-9
- [ ] `pnpm test src/assistant/ai-turn.test.ts src/assistant/chat-api.test.ts` → the "guest guards at Approve" and "abuse limits at chat" cases pass → AC-2, AC-4, AC-5, AC-6, AC-7
- [ ] `pnpm test:integration src/db/queries/turn-context.int.test.ts` on a throwaway Neon branch → the `mayCreate` cases pass (no row on `chat_limit`) → AC-6
- [ ] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e e2e/limits.spec.ts` → every notice renders, axe clean, at 360 and 1280px in both themes → AC-2, AC-5, AC-7, AC-8

### Value sourcing
- [ ] Guest flag and IP at Approve: a guest from `x-forwarded-for: 1.2.3.4` increments `limit:runs:ip:1.2.3.4:<lagosDate>`; with no forwarded header the IP key is never touched → AC-4
- [ ] "Approve that starts a run": only `startRun` and `restartRun` change the run counters; `resumeRun` and `stopRun` never do → AC-4
- [ ] "A run in progress": with a run `in_progress` in the chat, typed messages are neither refused nor counted by the daily chat limit; with only a paused run, they are → AC-5
- [ ] "Typed message": card taps and approval taps never move `limit:chat:<id>:<lagosDate>` → AC-5
- [ ] "Message accepted": a busy turn and a resend of a saved message do not move `limit:chat` → AC-5
- [ ] "Chat is new" / "may create": `limit:chats` moves only when a new `conversation` row appears; at the limit, an existing chat id still works → AC-6
- [ ] "Sign in succeeded": a failed anonymous sign in (non 200) does not move `limit:guests:<ip>:<lagosDate>` → AC-8
- [ ] Lagos day: a run started at 23:00 UTC lands in tomorrow's `limit:runs` key → AC-10

## Acceptance criteria coverage (milestones 2 to 4)
- AC-2 (Approve) · manual 4, 5, 13 · ai-turn tests · e2e
- AC-4 · manual 1, 2, 3, 6 · limits and ai-turn tests · value sourcing "guest flag and IP", "Approve that starts a run"
- AC-5 · manual 7, 8 · chat-api tests · e2e · value sourcing "run in progress", "typed message", "message accepted"
- AC-6 · manual 9 · chat-api tests · turn-context integration test · value sourcing "chat is new"
- AC-7 · manual 10 · chat-api and limits tests · e2e
- AC-8 · manual 11 · guest-limit and chat-request tests · e2e · value sourcing "sign in succeeded"
- AC-9 · manual 12 · limits tests
