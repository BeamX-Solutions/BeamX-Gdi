# 0012. Shared business profile: rationale

## Context

The workspace now runs Stellar and Beacon (the Claude advisory, spec 0011), with Luna next. Beacon and Luna both open with questions about the business itself (name, industry, years running), and Luna adds website, team size, business model and market reach. Clients who run more than one tool would answer these again. The scope promises that after one run, a second tool skips what the profile already knows, and that the client can view and edit the profile.

Spec 0002 reserved a `business_profile` table with JSONB facts and a merge rule for guest sign up (newer fact wins). Spec 0005 put an optional `factKey` on questions, and spec 0006 already has a prefill card that offers facts pulled from the chat with `source` values (`chat`, `profile`).

The hard part is that tools phrase the same fact differently. Beacon has 12 industries, Luna 18, and they overlap only partly. Beacon's years buckets are 1-3, 3-5, 5-10; Luna's are 1-2, 3-5, 6-10. A naive copy would put a wrong value into a question, which then flows into a report the client paid for.

This decision was made while the engineer was away, on their instruction to go with the recommended picks.

## Options considered

### Option 1: Store each tool's raw answers per tool

The profile keeps `{ toolId, questionId, value }` and only offers a value to the same question id in the same tool.

**Pros**: no mapping work; never wrong.
**Cons**: no cross tool benefit at all, which is the point of the feature; same tool reuse already exists through the "change my answers" restart.

### Option 2: Canonical facts with exact mappings, on the prefill card (chosen)

One canonical value per fact, with a pure `toFact` and `fromFact` per question. A fact is offered only when exactly one option covers it, always on the prefill card for a one tap confirm.

**Pros**: real cross tool reuse where the meaning is the same; never a guess; uses the existing prefill flow and its `source = 'profile'`.
**Cons**: each linked question needs a mapping and a test; some facts never cross because the buckets differ.

### Option 3: Canonical facts with best effort mapping and silent skip

Map to the nearest option and skip the question without asking.

**Pros**: fewest taps.
**Cons**: wrong prefill flows silently into paid reports; stale facts (a business that grew) are never confirmed.

## Rationale

Option 2 delivers the promise where it is safe and stays quiet where it is not. The prefill card already exists and already handles accept, edit and source tracking, so the profile is a second source for it rather than a new flow. Ranges for years and team size make the "exactly one bucket contains it" rule mechanical and testable, and a small industry hierarchy lets a precise answer (restaurants) serve a broader question (food and beverage) without the reverse guess.

Writing facts at run completion, in the same batch, keeps the profile consistent with what the client actually confirmed, and skipping answers that came from the profile avoids a loop that would refresh `updatedAt` without new information. The page is linked for accounts only because guests have no account menu and their facts already carry over on sign up.
