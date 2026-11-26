# 0011. Beacon Pro in chat: rationale

## Context

Beacon Pro is the standalone's premium report (`beamx-scorecard-v2/main.py`): the same 22 questions and identical scoring as Beacon, then one Claude call that writes a 900 to 1200 word advisory, streamed to the browser token by token over server sent events, after a scorecard event that renders first.

The workspace runs reports differently (spec 0005): a report runner in `after()` makes each AI call with structured output, checks it, saves it, and the panel polls a status read. The app sits on Vercel Hobby (300 seconds per call), and reports must survive a refresh, a retry, and a refund on the third failure. True token streaming has none of these properties today.

The scope also promises that a client who already ran Beacon gets Pro without answering again. The data model already records a run copied from another (`based_on_run_id`, spec 0002) but only copies within the same tool (`runs.startFrom`). Answers live per run, so reuse has to pick a run, cross the tool boundary, and stay owned by the same user.

The engineer decided, in this design conversation: scores first then the advisory; reuse the latest complete Beacon or Pro run from any chat, of any age, naming it on the card; full 150 credit price; typed sections; flags shown but no rule plan; guests allowed; carry over a half done Beacon run; the assistant suggests Pro on request for depth and once after a Beacon report.

## Options considered

### Option 1: Token streaming like the standalone

Add a streaming path to the runner (`streamText`, a resumable stream on Upstash) and type the advisory into the panel live.

**Pros**: matches the standalone exactly; the client reads while Claude writes.
**Cons**: a second report path beside the runner; the text is shown before the server can check it, so a rejected output vanishes on screen; refresh and retry need resumable streams for reports, which nothing uses yet; more to test.

### Option 2: Scores preview, then the whole advisory (chosen)

Keep the runner. Add an optional pure `toPreview(scores)` so the panel shows the score, bars and flags at once while the advisory phase runs; reuse answers through `reuseFrom` in `startRun`.

**Pros**: one report path; checked output only; refresh, retry and refund unchanged; the generic hooks help Luna and the profile later.
**Cons**: no word by word typing; a 30 to 60 second wait for the advisory text.

### Option 3: Same as every tool

Skeleton, then the whole report.

**Pros**: no contract change.
**Cons**: nothing feels live; the scope's promise changes.

## Rationale

Option 2 keeps the one property the platform depends on, that every report goes through the same checked, refundable runner, while still giving the client their score in under two seconds. The score is the moment of value in the standalone too (it sends the scorecard event first); the advisory typing out is nice but not what the client pays for, and it would cost a second report path with weaker failure handling.

Reuse lives in `startRun`, decided on the server before the approval card, because the card is where the client sees the price and must also see which answers they are agreeing to. Revalidating copied answers against Pro's own schema keeps a later question change from leaking bad data into a run. Abandoning a half done Beacon run and releasing its hold in the same batch keeps the money rule simple: one set of answers, one live hold.

Opus at medium effort (the existing `report` role) writes the advisory; adding a model role for one tool was not worth it.
