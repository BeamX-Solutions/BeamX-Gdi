# 0006. Assistant brain: rationale

## Context

The workspace is a chat where a business owner says what they need, and the assistant runs the right BeamX tool. Spec 0001 put the brain in `src/assistant/`, reaching tools only through the registry, and left the choice of models to this spec. Spec 0005 made tools pure modules with questions, flow helpers (`nextQuestion`, `progress`, `parseAnswer`, `scoreRun`) and a credit price. Spec 0004 requires the assistant to ask for approval before any credit is held, with a server written price, and meters chat beyond a small free allowance. Messages sent while a run is in progress are free.

The forces:
- The tools are question heavy: Stellar asks 11 questions, Beacon 22, Luna 50. Clients are mostly on phones, often on slow connections, so every answer must feel instant.
- Each AI call costs money that BeamX pays during runs (those messages are free), and guests can trigger calls without paying.
- The question order and scoring must match the original tools exactly (parity).
- Clients often explain their business in free text before a run starts, and asking them again feels careless. But spec 0002 requires answers pulled from the chat to be confirmed.
- The assistant must stay on BeamX topics, keep a warm Nigerian voice, and never invent numbers.
- The current Claude models reject forced tool choice and disabled thinking, and prompt caching needs a byte stable prefix.

## Options considered

### Option 1: Server driven cards, AI only for typed text (chosen)

Card taps go to a deterministic step that saves, picks the next card and completes. The AI runs only for typed messages, with tools to start, resume, restart, stop, save typed answers and reopen cards.

**Pros**: instant, free answering at any tool size; question order can't drift; the AI is spent where it adds understanding.
**Cons**: two paths through `handleTurn`; card replies are fixed text, not conversational.

### Option 2: The AI asks every question

The model calls an `askQuestion` tool per card, and every answer goes back through the model.

**Pros**: one path, the most conversational, and the model can rephrase questions in context.
**Cons**: one AI call per answer (50 for Luna, at BeamX's cost during free run messages); 2 to 5 seconds per question; the model can skip or reorder questions, which threatens parity and progress.

### Option 3: Server driven cards with an AI lead in per card

As Option 1, plus a cheap AI call writing one friendly sentence before each card.

**Pros**: warmer than fixed text, and order is still server owned.
**Cons**: an AI call and a delay on every question again, for wording that adds little.

## Rationale

The question count and the phone first audience settle it. With Options 2 and 3, a Luna run costs dozens of AI calls that BeamX pays for (run messages are free under spec 0004), and adds minutes of waiting. Option 1 makes answering instant and free, and keeps parity safe, because the server, not the model, owns the order. The AI still handles what it is good at: typed answers, side questions, routing and explaining.

Smaller calls, made on the same grounds:
- **Known facts on one confirm card**: removes repeated questions while meeting spec 0002's confirmation rule in a single tap.
- **One clarifying question at most before proposing**: keeps routing quick, and the approval card stays the real yes.
- **Pause and confirm on a tool switch**: reuses `runs.start`'s pause, so nothing is lost.
- **Chat controls as approval gated tools**: stopping and restarting touch credits, so they get the same confirm card as starting.
- **Opus 5.5 for every role**: the strongest tool use and instruction following for routing and the topic line, one cache namespace, and one behaviour set to evaluate. At low effort with caching, a chat turn costs about a cent, well inside the 3 credit ceiling. Sonnet 5.5 is the named step down if costs grow (Follow-up).
- **`resumeRun`'s price written by an async input refinement** (decided 2026-11-20, after the provider check): `refineResumeRun` reads `credits.runQuote` once and writes `shownPrice` only when no hold exists, and the approval is a pure function of that input. The AI SDK works out the approval again on the continuation from the approved input, and deep compares a fresh refinement with it. So an approval rule that reads only the input always agrees with itself, and a hold placed or released between the card and the tap is caught by the SDK before `execute` runs. Runner up: always write the price and let the approval function read the hold. That costs two reads per call, carries a price even when nothing is charged, and the continuation would treat the call as approved whatever the hold now says. Always asking for approval was ruled out, because spec 0004 AC-2 makes a resume with a hold free and tap free. `stopRun`'s `heldAmount` and `restartRun`'s price use the same refinement, so all money tools write server values one way.
- **Mock tests in CI, real model evals on demand**: deterministic CI without API cost or flakiness, plus a committed record whenever prompts change.
