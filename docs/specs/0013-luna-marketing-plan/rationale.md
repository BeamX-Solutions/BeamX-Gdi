# 0013. Luna marketing plan in chat: rationale

## Context

Luna is the paid marketing plan tool (about ₦50k a plan as a standalone). Its questionnaire has 50 questions (12 about the business, 38 across 9 marketing areas), and its plan is written by Claude in five calls in a row, each adding a slice of a rich plan object. The workspace runs on Vercel Hobby, where one function call lasts at most 300 seconds. The five calls together take longer than that, and a single slow call can take two minutes.

The standalone Luna already runs on Hobby. It does not chain on the server: each request runs one phase and answers 202, and the browser fires the next request. The workspace's report runner (spec 0005) runs every phase of a report in one call inside `after()`, skips phases already saved, and counts each claim as an attempt (three at most). That works for Stellar and Beacon, which have one short phase each, but would spend all three attempts on Luna's first three phases and could not fit five phases in one call.

The question flow is long for chat. The existing card flow, area progress, pause and resume, and the prefill card cover most of it, but Luna has an optional question and long text answers that today's cards do not handle.

This decision was made while the engineer was away, on their instruction to go with the recommended picks.

## Options considered

### Option 1: Server side chaining by self call

After each phase, the server calls its own report route for the next phase.

**Pros**: the plan finishes even if the client leaves.
**Cons**: the self call needs the client's session or a new internal secret; a failed self call strands the plan with nobody to notice; harder to test locally.

### Option 2: One phase per call, continued by the panel (chosen)

The runner stops after one phase and marks the report `partial`; the panel's poll POSTs for the next phase. A claim of a `partial` report does not spend an attempt.

**Pros**: no new infrastructure; identical to how the standalone already works on Hobby; a closed tab only pauses the plan, and reopening continues it; retries never redo saved phases.
**Cons**: the plan advances only while the chat is open.

### Option 3: A queue or workflow service

Run phases through Vercel Queues or a workflow engine.

**Pros**: durable, finishes without the client.
**Cons**: a new service and its failure modes before any client has asked for it; the project declined Inngest earlier.

## Rationale

Option 2 is the boring choice that is proven in production by the standalone Luna, on the same hosting plan. It keeps every money rule unchanged (the hold is charged once at ready, released after three failed calls) and needs one additive enum value. Counting attempts by failed calls rather than claims is what makes multi call reports fair. If data later shows clients leaving mid generation, a queue can be added behind the same `partial` state without changing the panel.

Mapping Luna's form fields onto existing card kinds, plus a Skip for the one optional question and a longer limit for long text, avoids new card types. Showing the plan with existing report blocks keeps this feature to the chat; the full layout belongs with the PDF feature.
