# 0005. Tool module contract and registry: rationale

## Context

Spec 0001 rebuilds the four BeamX tools inside the workspace as code modules behind one registry, and leaves the exact contract to this feature. The contract has to fit three real shapes, found in the source repos and captured in `fixtures/parity/`:
- Stellar: 10 questions (one with a follow up), fixed scoring, and one AI call that returns a structured analysis.
- Beacon and Beacon Pro: the same questions and identical scoring, but different reports (rule based advice polished by AI, or a streamed Claude advisory) and different prices (50 and 150 credits).
- Luna: 50 questions in 9 areas, no scoring, and a plan written by five AI calls in sequence, each building on the last.

The forces:
- `AGENTS.md` wants pure functions and side effects at the edges, typed results instead of throws, and Zod at every boundary.
- Spec 0002 stores `tool_id` and `tool_version` as text, caps a report at 3 attempts, fences writes by attempt, and promises that old reports stay as they were after a tool changes.
- Spec 0004 needs `creditPrice` from the module, a hold before generation, and a charge exactly once when the report turns ready, including across Luna's phases.
- Parity with the originals is required.

Reports run on Vercel functions. Luna's five calls can take several minutes, and clients are often on unstable mobile connections in Nigeria. A dropped connection must not lose a paid report, and a failure must show a clear retry, never a blank screen.

## Options considered

### Option 1: Pure tool modules, one shared runner (chosen)

Tools are data plus pure functions: questions, scoring, ordered phases (prompt builder plus Zod schema), a view model and a price. One runner outside `tools/` does the AI calls, retries, saving and charging. It runs from its own route in `after()`, and the panel polls.

**Pros**: tools are testable with no mocks; retry, resume, charge and usage logic is written once; tool folders cannot leak side effects.
**Cons**: the contract must anticipate what tools need (phases, blocks); a tool with an unusual flow needs a contract change.

### Option 2: Tools own an async `generateReport()`

Each tool gets an injected AI client and writes its own generation, keeping only questions and scoring declarative.

**Pros**: maximum freedom per tool, especially for Luna; a thinner contract.
**Cons**: every tool repeats validation, retry, attempt fencing and usage recording; side effects move into tool folders; money correctness (charge once) depends on each tool getting it right.

### Option 3: Tools as a union of kinds (`scored_single`, `phased`)

The contract is a discriminated union per report style, and the runner branches on the kind.

**Pros**: each kind reads close to its tool.
**Cons**: two code paths for the same job; Stellar is simply a one phase case, so the union adds branching without new power.

### Option 4: Durable workflow per report

Each phase is a durable workflow step (Vercel Workflow or Queues) that survives crashes and redeploys.

**Pros**: the most robust for long Luna runs.
**Cons**: a new platform piece to learn and operate for a one call Stellar report; saved phases plus stale reclaim already give most of the recovery.

## Rationale

The money and attempt rules from specs 0002 and 0004 (claim CAS, attempt fencing, charge in the same statement as ready) are the riskiest code in the app. Option 1 puts them in exactly one place, the runner, while Option 2 asks every tool to get them right. Pure modules also make parity testing (a hard requirement) trivial, and keep `AGENTS.md`'s side effects at the edges rule without exceptions.

Modelling every report as ordered phases covers all three shapes with one code path: Stellar and Beacon have one phase, Luna has five. Saving each phase into `report.content` while generating needs no migration (the CHECK only constrains `ready`), makes Luna retries cheap, and keeps the single charge at `markReady`.

The route plus `after()` plus polling design survives dropped mobile connections (the work continues and the client just polls again). It is easy to test with the mock model, and Vercel's 800 second limit fits five phases. Option 4 stays the escape hatch if real Luna timings prove otherwise; the contract and the route would not change.

The view model (blocks) instead of tool React components keeps `tools/` free of UI, gives the PDF (#15) the same source, and keeps every report on the design system. The cost is that Luna needs new block kinds, a bounded and visible amount of work.

Smaller calls, made on the same grounds:
- **Beacon pair as one folder with two modules**: keeps the folder import rule and maps price and `tool_id` one to one.
- **Frozen readers per version**: keeps old reports exact without a "never break" rule that would block scoring fixes.
- **`when()` plus `area`**: one first class question per card, so #6 can skip known facts by id.
- **Answer schema derived from the card**: one source of truth, which cannot disagree with what the card lets you enter.
- **Readable question ids with a parity map**: self describing in the DB, logs and prompts.
- **One repair try on bad output**: catches format slips without burning one of the 3 attempts.
- **Recording usage now, with the cap behind a hook**: no AI call ever goes unrecorded, without pulling the abuse feature into #5.
