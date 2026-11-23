# 0010. Beacon health check in chat: rationale

## Context

Beacon is the standalone business health check (FastAPI, `beamx-scorecard`). Clients fill a 25 field form: name, email, business name, then 22 multiple choice questions. Beacon scores five categories, builds a long markdown advisory from rules, and has OpenAI rewrite that advisory in a warmer voice. If the AI call fails, it quietly falls back to the rule text. The workspace rebuilds it on the spec 0005 tool contract, and it must score and advise exactly like the original (spec 0001). The fixtures in `fixtures/parity/beacon/` capture 200 scoring cases and 34 advisory cases.

Several forces shape the port:

- **Accounts already know who the client is.** Sign up (spec 0009) stores a first name and email, and the product promise is "never answer the same question twice" (#9).
- **Parity is byte level for the rule advisory.** Only the AI wording is exempt.
- **The contract's report view is plain text blocks.** Spec 0005 forbids HTML, and there is no markdown renderer. Beacon's advisory is nested markdown: headings, bold lead labels, italic notes, bullets and numbered steps.
- **The AI polish must never change facts.** The standalone only asks it nicely.
- **Beacon Pro (#11) shares the questions and scoring,** and needs the stored answers and scores to work unchanged.
- **Hobby limits each function to 300 seconds.** A phase plus its repair call must fit inside that.

## Options considered

### Option 1: Typed advisory, computed in `score()`, polished in one checked phase (chosen)

Port the rule advisory to build typed sections, and store them in `scores`. Claude returns the same schema with only the text rewritten, and a pure `check` enforces structure and numbers. A new `rich_section` block draws it.

**Pros**: exact parity at score level, testable in milliseconds. Facts can't drift. No markdown renderer is needed. Beacon Pro, the PDF and #13 read structure. **Cons**: the biggest port. A parity renderer exists only for tests. The number check can trigger repair calls.

### Option 2: Markdown both sides

Copy the markdown builder as is, have Claude return markdown, and add a safe markdown block.

**Pros**: the smallest port, and the closest to the standalone. **Cons**: a new markdown dependency and renderer surface. Nothing stops the rewrite changing a number or dropping a section. Later features would have to parse markdown.

### Option 3: Rules shown as is, Claude writes only an intro

Show the rule advisory unchanged as typed sections, and let Claude add a short personal summary.

**Pros**: the cheapest tokens. No check is needed, and the risk is near zero. **Cons**: it drops the full polish the standalone offers, so the report reads like a template.

### Option 4: Advisory worked out at report time

Keep only numbers and flags in `scores`, and rebuild the advisory from them in the prompt and the view.

**Pros**: smaller rows. **Cons**: the text a client saw can change if the rules change before a reread. Two places compute it, and the polish check and the view could disagree.

## Rationale

Option 1 is the only one that meets all the forces at once. Parity is exact and cheap to test. The advisory is computed once and frozen, so the check, the view and Beacon Pro all read the same thing. The polish keeps its value (a warm, personal voice), but the server enforces "don't change facts" instead of trusting the prompt. Typed sections also remove the need for a markdown renderer, which would otherwise widen the injection surface, and they give #13 and #15 structure to work with. The extra porting work is a one time cost, paid back when Beacon Pro reuses everything.

The standalone's silent fallback to rule text was rejected in favour of the standard retry path. A per tool fallback would put tool specific behaviour into the shared runner, and it would charge full price for less. The workspace already returns credits after three failures. Contact questions were dropped (except business name, which no account field holds) because the account carries the name and email. Asking again would break the "never ask twice" promise, create copies that drift, and widen what deletion and export must cover. Data minimisation under NDPA and GDPR is the secondary reason. The first name still personalises the advisory for account holders, through a small contract addition.

Smaller calls made here:
- **Opus 5.5 (the existing `report` role) for the polish.** It needs no new model id or price, and it writes best. A Sonnet `polish` role was the runner up, worth revisiting if Beacon's margin at 50 credits is thin.
- **Verdict thresholds at 70 and 50.** They match the advisory's own "How BeamX can help" split. The same thresholds apply to category percentages, so the bars agree with the header.
- **Findings as one advice list.** The runner up, insights under each bar, would change a shared block.
- **Kebab case option slugs.** They match Stellar's existing values.
