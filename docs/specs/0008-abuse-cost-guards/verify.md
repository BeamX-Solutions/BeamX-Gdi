# Verify: Abuse & AI cost guards · spec 0008 · updated 2026-11-22
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
- AC-2 (Approve), AC-4 to AC-8: later milestones
