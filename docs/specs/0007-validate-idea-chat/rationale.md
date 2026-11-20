# 0007. Validate an idea in chat: rationale

## Context

Specs 0001 to 0006 settle the stack, the data model, the design system, credits, the tool contract and the assistant brain, each tested on its own. Nothing yet proves they work together for a real visitor. The scope calls this feature the walking skeleton: a guest goes from a first message to a saved Stellar report, using real data and real AI, and a refresh keeps it.

The forces:
- Clients are mostly on phones with unstable connections, so a refresh or a drop must never lose a reply, an answer or a report.
- Guests trigger real AI costs. Bots and casual visitors must not create rows or spend money.
- Spec 0001 requires messages to be saved on the server in `onFinish`, never by the client, and asks this feature to build resumable streams.
- This Next.js version runs with Cache Components, so pages need a static shell, with request time reads inside Suspense.

## Options considered

### Option 1: Thin route over `handleTurn`, client sends only the new message (chosen)

The route does BotID, the session, the conversation check, the limits and saving. The assistant logic stays in `handleTurn`. The client sends one new message, and the server loads history from the DB.

**Pros**: history can't be forged by the client; the route stays small and testable; the request size stays tiny on mobile data.
**Cons**: one extra DB read per turn (already batched in `conversations.open`).

### Option 2: The client sends the full message list (the AI SDK default)

`useChat` posts every message each turn, and the server saves what it receives.

**Pros**: the least code, matches most AI SDK examples.
**Cons**: the client can edit or inject history (including fake assistant turns or tool results), which breaks spec 0001's server only rule and the approval guarantees; requests grow with every turn.

### Option 3: Server Actions instead of a route

Send messages through a Server Action that returns a stream.

**Pros**: no route file, typed calls.
**Cons**: weaker fit with `useChat`'s transport and resumable streams, and harder to guard with BotID and to test as HTTP.

## Rationale

Option 1 is the only one that keeps spec 0001's rule (the server owns history) and spec 0004's approval guarantee (the client can't forge a tool result) without extra checks. Sending only the new message also suits Nigerian mobile data.

Smaller calls, made on the same grounds:
- **Creating on first send, behind BotID**: keeps bots and casual visitors from creating users or conversations.
- **Client generated UUID v7 conversation ids**: let the URL change at once without a round trip; the server only checks the format and ownership.
- **Resumable streams now**: spec 0001 assigns them here, and dropped connections are the common case for this audience.
- **Credit UI now, metering later**: the confirm card and chip are on the thread's path; charging chat waits for its own milestone and #21, both before any public link.

### Added 2026-11-20, after the assistant brain review

Two gaps in the `handleTurn` contract surfaced in the spec 0006 code review, settled here before any route code exists.

- **When the turn lock is freed.** `handleTurn` freed the lock when its stream ended, but this route saves the reply in `onFinish`, a moment later. An approval tap sent again in that gap would still look pending and run a money tool twice. Options: (1) the route frees the lock after the save, through a `release` that `handleTurn` returns; (2) `handleTurn` detects a resent message id and refuses it; (3) save the reply inside `handleTurn`. Chose (1): one ordering rule closes the gap for every kind of turn, with no new query, and the reply stays saved in one place (`onFinish`). (2) is kept as a follow up for resent typed text. (3) would split saving between two layers.
- **How chat usage reaches `ai_usage`.** The AI turn's stream carries no usage, and the turn returned none, so `onFinish` had nothing to record. Options: (1) `handleTurn` returns a `usage` promise that settles after the stream; (2) put usage in the stream's message metadata; (3) the AI turn records usage itself, as extraction does. Chose (1): the write stays at the route edge with the assistant message id the `callKey` needs, and token counts never reach the browser or the saved message, which (2) would cause. (3) would need the route's message id passed down and move a write the spec places in `onFinish`.
