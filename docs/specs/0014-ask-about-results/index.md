# 0014. Ask about your results

**Date**: 2026-11-27
**Status**: In Progress

## Summary

After a report, the client can ask the assistant about it ("why is my cash score low?", "what should I do first?") and get answers taken from their own reports and business profile. The assistant reads a ready report through a new read only tool, quotes its numbers and findings, and says plainly when something is not in the client's reports instead of guessing. It can also reach reports from the client's other chats.

> Written on the engineer's instruction to go with the recommended picks (2026-11-27). Review before relying on it.

## Requirements

**User stories**:
- As a business owner, I want to ask follow up questions about my report and get answers about my business, not generic advice.
- As a business owner, I want the assistant to admit when my reports do not cover something.
- As BeamX, I want follow ups to lead naturally to the next tool or a consultation.

**Acceptance criteria**:
- **AC-1**: A new assistant tool `readReport` takes a `runId` and returns, for the client's own ready report, the tool name, the day it finished, and the report as plain text (`reportText`): every block of the tool's view in order (scores, bars, flags, findings, sections, roadmap), with no markup. It needs no approval card and costs nothing beyond the chat message.
- **AC-2**: `readReport` works for any of the client's runs, in any chat. Another user's run, an unknown run, or a run whose report is not ready returns a typed error (`not_found`, `not_ready`) the assistant explains in one sentence. A version change uses the reader for the stored version (spec 0005), so older reports read correctly.
- **AC-3**: The text is capped at 20,000 characters (a full Luna plan is about 14,500); a longer report is cut at a block boundary and ends with "(The rest of this report is not shown.)".
- **AC-4**: The run state note also lists the client's latest 5 ready reports from other chats ("Reports in other chats, newest first: Beacon (run …), 24 Nov"), and the client's business profile facts in plain words ("Business profile: Business name: Ada Foods; Industry: Restaurants; …"). Both are read in parallel with the chat, so a turn makes no extra round trip in sequence.
- **AC-5**: The instructions say: when the client asks about a report or their results, call `readReport` for that run first (the latest relevant one when they do not name it); state scores, findings and figures only as `readReport` gives them; when the reports and profile do not cover the question, say so in one sentence and offer the tool or consultation that would answer it; never invent a number.
- **AC-6**: Follow ups are ordinary chat messages under the existing allowance and metering (spec 0004): no new price.
- **AC-7**: The assistant eval gains cases: a question about a completed report calls `readReport` with that run; a question the reports cannot answer gets no invented number. The results file is committed.

## Decision

**Chosen option**: a read only `readReport` tool plus a fuller run state note.

Reports stay out of the cached prefix and out of every turn; the assistant pulls one only when a question needs it, so ordinary turns stay cheap, and its answers rest on the stored report rather than on what it remembers from the chat.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

## Rationale

Options considered:
- **Report text in the note every turn**: simplest, but a Luna plan is about 10,000 characters; every turn of every chat would pay for it, and the note sits after the cache breakpoint, so it is never cached.
- **A retrieval index over reports**: unneeded at this size; a client has a handful of reports, and the assistant can name the one it needs.
- **The chosen tool**: pays only when asked, reuses the tool readers and view builders that already draw the panel, and keeps the assistant's grounding rule ("only numbers from a tool result") easy to follow.

## Feature design

**Data model sketch**: no schema change.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `readReport` | assistant tool, no approval | `runId` | `{ ok, toolName, finishedOn, text, truncated }` | the turn's owner | `not_found`, `not_ready` |
| `runs.recentReports` | DB query | `userId`, `excludeConversationId`, `limit` | `{ runId, toolId, completedAt }[]` | owner | none |
| `reportText` | pure function | report blocks | text | n/a | n/a |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| readReport | report text | `runs.get(owner, runId)` → `getReader(toolId, toolVersion)` → `buildView` (spec 0005) → `reportText` |
| readReport | finished on | `tool_run.completed_at`, day in Africa/Lagos |
| note | other chats' reports | `runs.recentReports(owner, conversationId, 5)`: completed runs with a `ready` report, newest `completed_at` first, other conversations only |
| note | profile facts | `profile.get(owner)` → `formatFact` per valid key (spec 0012) |

**Key invariants**: every read is owner scoped; `readReport` never writes; the report text contains only what the tool's own view shows.

**Security model**: the turn's owner only (after a guest link, the linked owner, as every tool). Report text is the client's own data and goes back to the model inside the tool result, like any tool output; the instructions already treat tool results and the note as data, not instructions.

**Configuration required**: none.

**Critical test scenarios**:
- A completed Beacon run: `readReport` returns the score line, the five bars and the advisory headings as text, verifies **AC-1**
- Another user's run returns `not_found`; a generating report returns `not_ready`, verifies **AC-2**
- A long report is cut at a block and marked, verifies **AC-3**
- The note lists other chats' ready reports and profile facts, verifies **AC-4**
- Eval: "why is my score low?" calls `readReport`; "how much profit did I make last year?" states no number a tool did not return (the grounding grader now allows numbers from a tool result of the same turn), verifies **AC-5**, **AC-7**

## Build plan

1. [x] `reportText` and `runs.recentReports`, unit and integration tests, satisfies **AC-1**, **AC-3**, **AC-4**
2. [x] The `readReport` tool and its deps, tool order, turn tests, satisfies **AC-1**, **AC-2**, **AC-6**
3. [x] The note's other reports and profile lines, read in parallel with the chat, satisfies **AC-4**
4. [x] Instructions, eval cases, eval run and results, satisfies **AC-5**, **AC-7**

## Consequences

**Positive**: grounded answers from real reports; no cost on ordinary turns; works across chats.

**Negative / tradeoffs**: a question about a report costs one extra model step (the tool call) and the report text as input tokens; the note grows by a few lines; two extra parallel reads per turn.

**Neutral**: a new tool changes the assistant's tool definitions, so the eval results must be rerun and committed.
