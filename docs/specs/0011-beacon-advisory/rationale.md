# 0011. Beacon becomes the Claude advisory: rationale

## Context

BeamX ran two standalone health checks on the same 22 questions and identical scoring: Beacon (a rule based advisory, polished by an LLM) and Beacon Pro (a full advisory written by Claude, streamed to the browser after a scorecard event). The workspace shipped Beacon first (spec 0010, rule advisory polished by Claude, 50 credits) and planned Beacon Pro as a second tool at 150 credits.

On 2026-11-26 the engineer decided there should be one health check: the Pro advisory, under the name Beacon, priced between Stellar and Luna. A first draft of this spec had built Pro as a separate tool with cross tool answer reuse; that draft was reworked before it shipped.

The workspace runs every report through one runner (spec 0005) with structured output, a server side check, retries and a refund on the third failure, on Vercel Hobby (300 seconds per call). Beacon v1 reports already exist in the database and must keep opening.

## Options considered

### Option 1: Keep both tools

Beacon (rule advisory, 50) and Beacon Pro (Claude advisory, 150) side by side.

**Pros**: a cheap entry point and an upsell.
**Cons**: not what the business wants; two tools that differ only in the report confuse clients and the assistant.

### Option 2: Beacon v2 is the Pro advisory, v1 kept as a reader (chosen)

Bump `beacon` to version 2 with Claude's advisory, keep a frozen v1 reader for stored reports, delete the rule advisory builder.

**Pros**: one product; stored reports keep working through the version mechanism spec 0005 already has; the rule builder (about 1000 lines) and its parity tests go away.
**Cons**: a small v1 reader stays in the tool folder; in progress v1 runs restart on v2 (with their answers offered back).

### Option 3: Replace in place with no version bump

Change Beacon v1's phase and view directly.

**Pros**: no reader to keep.
**Cons**: every stored v1 report would fail to parse and show "could not read this report"; breaks spec 0005, AC-13.

## Rationale

Option 2 delivers the product decision while honouring the rule that stored data never breaks. The version mechanism exists for exactly this, so the change is mostly moving the Pro work into the `beacon` folder.

For the report itself, the score preview keeps the one property the platform depends on, that every report goes through the same checked, refundable runner, while still giving the client their score in under two seconds, which is the moment of value the standalone Pro also front loads with its scorecard event. Word by word streaming would have needed a second report path with weaker failure handling.

150 credits keeps Beacon between Stellar (30) and Luna (500), as the engineer asked, and matches the AI cost of a full Opus advisory.
