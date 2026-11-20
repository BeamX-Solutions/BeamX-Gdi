# Assistant evals

## Overview

The real model eval of the assistant (spec 0006, AC-15). It runs the real instructions, registry built tools, approvals and known facts extraction on the `chat` and `helper` model roles, against an in memory world (no database, no writes), grades every case, checks the prompt cache, and writes a dated results file. CI never runs it; CI only checks that a results file matches the current prompts.

## Key files

| File             | Owns                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cases.json`     | The eval cases (route, ambiguous, off topic, on topic, Pidgin, grounding, typed answer, control, extraction)                                          |
| `cases.ts`       | The Zod schema `cases.json` must pass (case ids unique)                                                                                               |
| `world.ts`       | The in memory world: the AI turn's query deps over plain data, Stellar runs behind `@active`, `@paused`, `@completed` refs                            |
| `graders.ts`     | Deterministic graders per case kind, plus `summarize` and the pass bars (routing at least 90%, off topic declined at least 95%, no on topic declines) |
| `judge.ts`       | The `helper` role judge, used only for the off topic, on topic and Pidgin cases                                                                       |
| `fingerprint.ts` | `promptFingerprint`: a hash of the instructions, extraction prompt, `startRun` description and model roles                                            |
| `run.ts`         | `pnpm eval:assistant`: runs the cases, prints the summary, writes `results/<date>.json` (`-2`, `-3` on the same day)                                  |
| `results/`       | Committed results files, one per prompt fingerprint                                                                                                   |

## Commands

```bash
pnpm eval:assistant        # spends real tokens, needs ANTHROPIC_API_KEY; exit 0 only when every bar holds
pnpm test -- evals         # graders, case schema, and the fingerprint check (no network)
```

## Conventions

- Any change to `src/assistant/instructions.ts`, the extraction prompt, a registered tool's `name` or `whenToUse`, or `src/assistant/models.ts` changes the fingerprint. `results.test.ts` then fails in CI until you run `pnpm eval:assistant` and commit the new results file with the change.
- Cases for a tool that isn't registered yet carry `requiresTools` and are skipped (registering the tool makes them run, and changes the fingerprint).
- Grade deterministically wherever you can; the judge is for tone and decline cases only.
- CI must never run `pnpm eval:assistant`.

## Related specs

- [0006 Assistant brain](../../docs/specs/0006-assistant-brain/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
