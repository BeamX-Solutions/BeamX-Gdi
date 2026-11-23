# Components

## Overview

Shared UI for the whole workspace, built in spec [0003](../../docs/specs/0003-design-system-ui-foundation/index.md) and written up in [DESIGN.md](../../DESIGN.md). Everything here renders from props and fixture data; no component reads the DB, calls AI, or reads env. Routes in `src/app/` import from here.

## Folders

| Folder          | Owns                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/`           | shadcn primitives (Radix base), touch sizes raised to 44px. Add new ones with the `shadcn` CLI, then restyle with tokens only                               |
| `ai-elements/`  | AI Elements parts (conversation, message, shimmer, suggestion), restyled with tokens                                                                        |
| `workspace/`    | The shell (`WorkspaceShell`, header, history rail, report panel and sheet), `Thread`, `Composer`, `RunProgressBar`, theme toggle                            |
| `answer-cards/` | The four card kinds from one `QuestionView` shape, the answered bubble, and pure helpers (`format-answer`, `validate`, `progress-label`)                    |
| `report/`       | Score header, verdict badge, category bars, advice list, report section, skeleton, with pure `bar-math` and `verdict`                                       |
| `credits/`      | The credit chip and the money cards (confirm, approval, short balance, stop), copy in `credit-copy.ts`                                                      |
| `feedback/`     | `ErrorCard` for the four expected failure kinds, copy in `error-copy.ts`                                                                                    |
| `auth/`         | The auth dialog (sign up, code, password, sign in, reset), the header account menu, the delete account dialog, the save prompt card; copy in `auth-copy.ts` |
| `fixtures/`     | Typed mock data for every state, used by `/design`, Vitest, and Playwright                                                                                  |

## Conventions

- Style only with tokens from `DESIGN.md` (CSS variables in `src/app/globals.css`). No hex, `rgb`, `oklch`, or Tailwind palette colors; `pnpm check:colors` fails CI on one.
- A new token goes in `globals.css` and `DESIGN.md` together; `design-tokens.test.ts` checks the names match.
- A verdict is never color alone: always the icon plus a text label (`VerdictBadge`). Error cards use neutral and destructive tokens, never verdict colors.
- Logic lives in small pure `.ts` files beside the component, each with a Vitest test (`*.test.ts`); components stay thin.
- One layout tree at a time: `useIsDesktop` picks desktop (rail, chat, resizable panel) or phone (drawer, sheet). Never render both and hide one with CSS.
- Every tap target is at least 44 by 44px (inline text links are exempt). Animations must stop under reduced motion. The global rule in `globals.css` covers CSS animations and transitions only, so anything animated from JavaScript must check `prefers-reduced-motion` itself.
- The live chat is `workspace/chat.tsx` (the `useChat` client, spec 0007); what the thread shows comes from the pure `chat-view.ts`, so thread rules (which card is live, busy and limit notices, Send again) get a Vitest case there.
- The thread owns the only polite live region (`announce.ts`); do not add another.
- A new shared component or state also gets a showcase on `/design` (`src/app/design/`) and, for a key flow, a Playwright check in `e2e/`.

## Commands

- `pnpm test` runs the pure helper tests and the token check.
- `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` runs the axe scans, keyboard walks, and layout checks at 360 and 1280px in both themes.

## Agent skills

- [shadcn](../../.claude/skills/shadcn/): `shadcn-ui/ui`, adding and styling primitives
- [ai-elements](../../.claude/skills/ai-elements/): `vercel/ai-elements`, chat UI parts
- [playwright-cli](../../.claude/skills/playwright-cli/): `microsoft/playwright-cli`, driving the e2e checks

_Drafted by /sync from the introducing change, worth a quick human pass._
