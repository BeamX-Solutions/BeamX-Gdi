# 0008. Abuse and AI cost guards: rationale

## Context

The workspace lets anyone chat and run a tool without signing up. A guest gets a real user row on the first send, 30 starter credits on the first Approve, and every chat message is a paid Claude call. Feature #7 shipped the first guards (BotID on chat and guest sign in, a 4,000 character message limit, 40 typed messages per run, output token ceilings, a per chat turn lock), but nothing bounds how many runs, messages, chats or guests one person or one script can make in a day, and nothing bounds the total AI spend. Spec 0001 set the rules and defaults; spec 0005 left an empty `checkSpendCap` hook for this feature to fill.

The forces: spend must have a hard ceiling before a public link; the team is small and on Vercel Hobby, so no new services; Nigerian mobile carriers put many people behind one IP, so IP limits must be loose; and the database is in Frankfurt, far from Nigeria, so guards must not add database round trips to every turn. #22 (credits) will later meter chat beyond a free allowance and cap guest grants per IP, using the same Lagos day and a shared client IP helper this feature provides.

Without this feature, one script that gets past BotID can open guests, chats and runs without limit, and a busy or abusive day has no ceiling on the Anthropic bill beyond the console's monthly limit.

## Options considered

### Option 1: Redis counters per Lagos day at the entry points

`@upstash/ratelimit` sliding windows for per minute bursts, plain `INCR` keys per Lagos date for daily counts and the spend total, checked in the chat route, the run approval tools and the guest sign in route; fail open on Redis errors.

**Pros**:
- No new service: Upstash is already used for the turn lock and resumable streams.
- No added database round trips; each check is a few milliseconds.
- Calendar days line up with #22's allowance and grant keys.

**Cons**:
- Counters can overshoot by one under parallel requests.
- The spend total is a second copy of what `ai_usage` holds and can drift slightly.

### Option 2: Postgres as the source for every count

Count runs, messages and chats from their tables, and sum `ai_usage.cost_usd` for today's spend, in the existing `turnContext` batch.

**Pros**:
- Always exact; nothing to keep in step.

**Cons**:
- Heavier queries on every turn, against a database far from users; the IP limits have no table to count from.
- Burst limits per minute are awkward in SQL.

### Option 3: Vercel Firewall rate limiting rules

Rate limit `POST /api/chat` and the sign in route at the edge with Vercel's firewall.

**Pros**:
- Nothing in code for the burst limits.

**Cons**:
- Cannot express per user, guest only, per Lagos day or spend based rules; the other limits still need code.
- Ties limits to dashboard config outside the repo and the env.

## Rationale

Option 1 fits every force: it reuses the Redis the app already runs, keeps the Frankfurt round trip count where it is, and expresses each rule the engineer chose (guest only, Lagos days, check then count). Option 2's exactness is not worth slower turns, and `ai_usage` stays the exact record for billing and audits anyway. Option 3 covers only the burst case and moves config out of the repo.

Failing open was chosen over failing closed because a Redis blip should not lock real users out, and spend is still bounded by the Anthropic console's monthly limit. The turn lock keeps failing closed (spec 0006), because there a missed lock means a duplicate run, not a missed limit.

The spend pause sits at Approve and at chat, not inside the report runner, so a guest who already holds credits for a claimed report always gets it. Run limits count on start, not on proposal, so a guest is never charged a limit for a confirm card they declined.

## Update 2026-11-22: the burst limit during runs (AC-12)

**Context.** After the first build, guests tapping quickly through a Stellar run (about 10 question cards, plus the first message and the Approve tap) could hit "You're sending messages fast" partway through. Every `POST /api/chat` shared one 10 a minute window per user, but card taps (answers, prefill responses, retries) take the card path in `turn.ts` and never call the AI. The per chat turn lock already runs them one at a time.

**Options considered.**

- **A separate, looser per user window for card turns (chosen).** AI turns keep 10 a minute; card turns get 30. Pros: the strict window stays on the turns that spend money; normal tapping never trips; a script is still bounded per user. Cons: one more env var and Redis key; the body must be classified before the burst check.
- **Exempt card turns from the per user window.** Pros: simplest. Cons: only the IP window and the turn lock bound them, so nothing per user stops a script hammering card answers across chats.
- **Raise the single window to about 30.** Pros: an env change only. Cons: loosens the guard on paid AI turns threefold.
- **Keep it as is.** Pros: no work. Cons: the main guest flow breaks mid run, right before a public link.

**Rationale.** The burst limit exists to protect AI spend, so the window should follow what a turn can cost, not just that a request arrived. 30 a minute is one tap every 2 seconds held for a full minute, faster than anyone reads a card. Approve and Stop stay in the strict window because they lead to an AI call and can hold credits, and a run has only one or two of them. An unparsable body counts in the strict window, as before, so junk is never free. Card taps still count toward the IP window, which stays the outer fence for every request; 60 a minute leaves room for a few people on one carrier IP. A refused tap reuses the `slow_down` notice, because Got it already makes the card live again, so there is no new copy or showcase entry to keep.
