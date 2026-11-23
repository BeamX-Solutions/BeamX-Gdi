# Verify: Beacon health check in chat · spec 0010 · updated 2026-11-23

_Steps derived from spec 0010 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] In a new chat as a guest, send "how healthy is my business" → Beacon is proposed on a "Start Beacon?" card that says "This uses 50 credits." → AC-12
- [x] As that guest, tap Approve → the "Not enough credits" card with a Sign up button (a guest's starter credits never cover 50) → AC-12
- [ ] Sign up from that card, ask again, approve → the chip drops by 50 only once the report is ready, never at Approve → AC-12, spec 0004 AC-5
- [ ] Answer the 23 cards → first the business name (text, up to 100 characters), then 22 choice cards in the standalone order; no name or email card; the progress line shows areas such as "Financial Health" → AC-2
- [ ] Type a business name of 101 characters → refused with "Keep it to 100 characters or fewer." → AC-2
- [ ] Ready report, top to bottom → band header (score out of 100, no emoji), "Your five areas" (label "Name (grade)", out of 20), "What we found", one section per advisory section, "Talk to BeamX" with the booking link → AC-9
- [ ] In "What we found" → critical findings marked high with "CRITICAL:" removed, the weakest category's findings first → AC-9
- [ ] Bar colors and header verdict → 70% and up good, 50% and up caution, below 50% risk; Scale-Ready and Stable Foundation good, Building Blocks caution, Survival Mode and Red Alert risk → AC-10
- [x] Reload the chat → the ready report is still there behind View report → AC-12
- [ ] Signed in with the name "Ada", run Beacon on a real model → the advisory uses "Ada" a few times; as a guest it uses "you" only → AC-7
- [ ] Real model run → headings, bold leads, labels, every number and the booking link match the rule advisory; the wording reads warmer → AC-8
- [ ] Force the polish to fail (for example a tiny `timeoutMs` locally) → the standard retry card; the third failure returns the 50 credits → AC-12
- [x] `/design`, "Ready, Beacon" panel → every rich part kind shows; `<script>alert(1)</script>` shows as text → AC-11

## Commands

- [x] `pnpm test -- src/tools/beacon` → 200 scoring and 34 advisory parity cases pass → AC-5, AC-6
- [x] `pnpm test -- src/tools/contract.test.ts` → Beacon keeps every contract invariant, including timing (90s, 180s with repair) → AC-1
- [x] `pnpm test -- src/assistant/report-runner.test.ts` → a check rejection makes one repair call carrying its issues; a second rejection ends `invalid_output` → AC-8
- [ ] `pnpm test:integration` (throwaway Neon branch) → `runs.ownerOf` gives a guest no first name, an account its name trimmed and cut to 50, a blank name none → AC-7
- [x] `pnpm e2e e2e/beacon-flow.spec.ts e2e/report.spec.ts` (after a build with `ENABLE_DESIGN_PAGE=true`) → the whole flow passes and axe is clean → AC-11, AC-12
- [x] `pnpm eval:assistant` → the Beacon route cases pass inside the 90% routing bar; commit the results file → AC-13

## Value sourcing (one check per row)

- [ ] Price 50 on the card comes from `beacon.creditPrice`: change it locally to 51 and the card follows
- [x] `tool_run` row → `tool_id` "beacon", `tool_version` "1"
- [x] `tool_run_answer` rows → question ids and slugs (for example `profit_margin` = `30-pct-plus`), the business name trimmed
- [ ] `tool_run.scores` → total, band, five categories, flags and the advisory, frozen at completion (a later report retry never recomputes it)
- [ ] Prompt (log the built prompt locally) → business name, first name or "none", band label, total, and industry, years and pain point as labels, not slugs, all inside `<client_data>`
- [x] `report.content` → `{ advisory }` with the rewritten text
- [ ] Resources → title and URL from the advisory's link part, description "Book a free 30-minute strategy call"
- [x] Usage rows → `report:<runId>:<attempt>:advisory:1` (and `:2` after a repair), model from the `report` role

## Acceptance criteria coverage

- AC-1 contract test · AC-2 cards and the 101 character name · AC-3 `questions.test.ts` factKeys · AC-4 `scoring.test.ts` incomplete · AC-5 and AC-6 parity tests · AC-7 prompt test, owner integration test, real run · AC-8 check tests, runner tests, real run · AC-9 and AC-10 report UI and `view.test.ts` · AC-11 `/design` and `report.spec.ts` · AC-12 `beacon-flow.spec.ts` and the failure step · AC-13 the eval run
