# 0003. Design system and UI foundation for the BeamX Workspace

**Date**: 2026-11-18 (type updated 2026-11-21: Montserrat headings)
**Status**: Accepted

## Summary

This spec sets the BeamX Workspace look and the building blocks every later screen uses. The feel is a calm, trusted advisor: mostly neutral surfaces in the BeamX royal blue from the logo (with its sky blue and a small touch of its orange), Montserrat (the BeamX brand font) for headings and Inter for everything people read at length, medium rounded corners, and green, amber, and red kept only for score verdicts. It defines the chat parts (thread, composer, tap to answer cards, status lines, error cards), the report parts (score header, category bars, advice list, long written sections), and the workspace shell (chat with a report panel beside it on desktop, a full screen report sheet on phones). Everything is built on shadcn/ui and Vercel's AI Elements, shown on mock data on a dev only `/design` page, written up in `DESIGN.md`, and checked automatically for keyboard use, contrast, and small phone screens. Feature #7 then only has to plug in the real chat and database.

## Requirements

**User stories**:
- As a business owner on a small Android phone, I want the chat, answer cards, and report to fit my screen and stay usable while my keyboard is open, so I can finish a run on the go.
- As a client, I want to answer most questions with one tap, but still be able to type or ask what a question means, so it feels like a conversation, not a form.
- As a client who mistapped, I want to fix an answer before my run is scored.
- As a client in a long tool (Luna), I want to see how far I am and pause, so I don't give up halfway.
- As a client on desktop, I want to read my report beside the chat and keep asking about it.
- As a client who uses a keyboard or a screen reader, I want every control reachable and every reply announced.
- As a developer building a later feature, I want ready made, documented components and one source of truth for the look, so I never invent styles.

**Acceptance criteria**:
- **AC-1**: `DESIGN.md` at the repo root documents the feel, every color token (light and dark, including verdict tokens), the type scale, spacing, radius, motion, layout breakpoints, and one section per shared component listing its props, states, and usage rules. Every token it names exists in `src/app/globals.css` with the same name, checked by a Vitest test.
- **AC-2**: The theme follows the device setting by default. A toggle in the header menu offers Light, Dark, and System; the choice persists across reloads, and no page load ever shows the wrong theme first (no flash).
- **AC-3**: On `/design`, in both themes, at 360px and 1280px wide, an axe scan reports zero WCAG 2.2 A or AA violations (including color contrast). A verdict is never shown by color alone: it always carries an icon and a text label.
- **AC-4**: At 1024px wide and above, the shell shows a header, a collapsible history rail (16rem open, 3.5rem collapsed), and the chat column. When the current chat has a report, a report panel opens to the right of the chat, resizable by mouse and by keyboard (arrow keys on the handle), default 45% wide, never under 360px or over 60%, and the chat column never under 360px. Below 1280px the rail collapses on its own when the panel opens. Panel width and rail state are not saved between visits. With no report, the chat column is centered with a max width of 48rem and no empty panel shows.
- **AC-5**: Below 1024px, the layout is one column with no horizontal scroll at 360px. The composer stays pinned above the on screen keyboard and the phone's safe area. A report is reached through a "View report" card in the thread that opens a full screen sheet; the sheet closes by its close button or Escape, and focus returns to the card that opened it. The history rail becomes a drawer opened from a menu button. Only one layout tree is ever rendered (never both hidden by CSS), and long words or links wrap instead of widening the page.
- **AC-6**: The thread shows user and assistant messages and renders streamed markdown as it arrives. It sticks to the bottom while text streams, unless the client scrolled up, in which case a "Jump to latest" button appears. While the assistant works, a status line with a shimmer shows a plain text status. A screen reader hears the full text of each finished assistant reply once (not token by token), and each new status line text, through one polite live region owned by the thread.
- **AC-7**: The composer grows with its text up to 6 lines. With a fine pointer (desktop), Enter sends and Shift+Enter adds a line; on touch screens (coarse pointer), Enter adds a line and only the Send button sends. Enter never sends while a word is still being composed (`isComposing`, for predictive or other language keyboards). Send is disabled when the trimmed text is empty or the text is over 4,000 characters (JavaScript string length). A counter reading "3,712 / 4,000" appears past 3,600 characters. Its text is at least 16px so phones don't zoom in. While an answer card is open, the composer stays usable and shows the hint "Or type your answer".
- **AC-8**: Four answer card types render from one `QuestionView` shape, with the behavior in the card behavior table below: single choice (chips, sends on tap), multiple choice (Confirm button disabled until `min` picks, further picks blocked at `max`, hint "Pick 2 to 4"), scale (sends on tap, `min` to `max` with end labels, wrapping into two rows past 7 points), and short text or number (Submit button and Enter, validated on submit, money as whole naira with a ₦ prefix). Single and scale are radio groups (one Tab stop, arrow keys move, Space or Enter picks); multi is a group of checkboxes reached with Tab. Every card with `help` shows a "What does this mean?" toggle that reveals it. Every tap target is at least 44 by 44px, except inline text links, which meet the 24px WCAG 2.2 minimum. The card shows progress as "Marketing · Area 3 of 9 · Question 4 of 7", or "Question 4 of 7" with no area (counts start at 1).
- **AC-9**: Once answered, a card collapses into a user reply bubble showing the formatted answer. While the card is `editable`, the bubble shows an Edit control that reopens the card with the previous answer selected and focus on it. After a card is answered, focus moves to the composer. When not editable, no Edit control shows.
- **AC-10**: While a run is active, a thin progress bar pins under the header showing the tool name, how many questions are done out of the total, and a Pause button. It is hidden when no run is active.
- **AC-11**: Shared report parts render from props: a score and verdict header, labeled category bars drawn in HTML and CSS (each bar also shows its value as text), an advice list with priority tags, and a long form markdown section that can stream. While a report is generating, the panel shows a skeleton with a list of named steps that tick off as each finishes.
- **AC-12**: One `ErrorCard` renders every expected failure inline, in the thread or the panel, with a short plain message and exactly one primary action, styled with neutral and destructive tokens (never verdict colors). The four kinds and their actions: `ai_error` → Retry; `network` → Retry; `limit_reached` → "Sign up to keep going" (links to `/sign-up`, a placeholder until feature #8); `spend_cap` → "Got it" (dismisses). No failure state in the fixtures renders a blank area or relies on a toast.
- **AC-13**: The `/design` page renders every token and every shared component in every state listed in `DESIGN.md`, on fixture data. It returns 404 unless `ENABLE_DESIGN_PAGE` was `true` when the app was built (Cache Components renders the page at build time, so changing the flag needs a new build).
- **AC-14**: With reduced motion set on the device, every animation and transition is off (shimmer, skeleton pulse, panel, sheet, drawer, and the Radix and `tw-animate-css` animations shadcn ships), through one global rule in `globals.css`; content still appears.
- **AC-16** (added 2026-11-21): Headings use Montserrat, the BeamX brand font, through one `--font-heading` token: every `h1` to `h4`, and every title at 16px or larger set in weight 600 (the list in **Type** below). All other text (chat replies, buttons, chips, answer options, labels, hints, body, and anything under 16px) stays Inter. `/design` shows both fonts in the type scale, axe still passes, and nothing scrolls sideways at 360px with the wider headings.
- **AC-15**: The Playwright suite (axe scans with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` tags for AC-3; keyboard walks for AC-4, AC-5, AC-7, AC-8, AC-9; live region text checks for AC-6; the 360px checks for AC-5; a reduced motion run for AC-14) runs in Chromium in CI on every PR against a production build and uploads its HTML report. It is not enforced as a required check: the repo is private on the GitHub free plan, which has no branch protection, so you keep the rule yourself and never merge while it is red.

## Decision

**Chosen option**: Option 1: shadcn/ui and AI Elements, restyled with BeamX tokens, shown on a dev only `/design` page

Build the look as shadcn CSS variable tokens (BeamX royal blue from the logo, sky blue and orange accents, neutral surfaces, reserved verdict colors, Montserrat headings over Inter text, medium radius) with light and dark themes through `next-themes`; take the chat parts from AI Elements and restyle them; hand build the answer cards, report parts, error card, and workspace shell on shadcn primitives; document it all in `DESIGN.md`; and prove it on a `/design` page tested by Playwright with axe.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `ai-elements` (`vercel/ai-elements`, `.claude/skills/ai-elements/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`) · `next-cache-components-adoption` (`vercel/next.js`, `.claude/skills/next-cache-components-adoption/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`) · `next-bundle-optimizer` (`vercel/next.js`, `.claude/skills/next-bundle-optimizer/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Brand colors (sampled from `public/brand/logo-original.png`, the only logo file BeamX has)

| Brand color | Hex | oklch | Contrast on white | Role in the app |
|---|---|---|---|---|
| Royal blue | `#02428E` | `oklch(0.393 0.139 257.3)` | 9.7:1 | Light theme `--primary`: buttons, links, user bubble |
| Sky blue | `#008BD8` | `oklch(0.614 0.152 244.2)` | 3.7:1 (UI parts only, never small text on white) | `--brand-sky`: focus ring, progress fill, selected chip border; a lighter shade (`#3BA4E6`) is the dark theme `--primary` |
| Orange | `#F27900` | `oklch(0.703 0.179 52.9)` | 2.8:1 (decoration only) | `--brand-orange`: small accents only (the active step dot, a thin highlight on the "Book a consultation" card, the logo). Never text, never the only sign of a state |
| Ink | `#1D1D1B` | `oklch(0.230 0.004 106.7)` | 16.9:1 | Light theme `--foreground` |

Because the brand orange sits close to amber, the caution verdict is **yellow** (hue about 90), not amber, so a score can never be mistaken for brand decoration.

### Design tokens (the starting values; the axe contrast check in AC-3 is the gate)

All tokens are shadcn CSS variables in `src/app/globals.css`, in `oklch` (a color format that keeps lightness even across hues), exposed to Tailwind through `@theme inline`. If a value fails contrast, adjust its lightness only, keep the hue, and update `DESIGN.md` in the same change.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.99 0.003 257)` | `oklch(0.183 0.031 263)` (`#0B1220`) | Page |
| `--foreground` | `oklch(0.230 0.004 107)` (brand ink) | `oklch(0.96 0.01 257)` | Body text |
| `--card` / `--popover` | `oklch(1 0 0)` | `oklch(0.22 0.03 262)` | Cards, menus |
| `--card-foreground` / `--popover-foreground` | same as `--foreground` | same as `--foreground` | Text on cards and menus |
| `--secondary` | `oklch(0.95 0.01 257)` | `oklch(0.27 0.03 262)` | Secondary buttons, neutral badges |
| `--secondary-foreground` | same as `--foreground` | same as `--foreground` | Text on secondary |
| `--muted` | `oklch(0.96 0.008 257)` | `oklch(0.26 0.03 262)` | Assistant bubble, skeleton |
| `--muted-foreground` | `oklch(0.50 0.03 257)` | `oklch(0.72 0.02 257)` | Secondary text |
| `--primary` | `oklch(0.393 0.139 257.3)` (royal blue `#02428E`) | `oklch(0.688 0.135 240.8)` (light sky `#3BA4E6`, 6.8:1 on the dark page) | Brand, primary buttons, links, user bubble |
| `--primary-foreground` | `oklch(0.99 0 0)` | `oklch(0.183 0.031 263)` | Text on primary |
| `--accent` | `oklch(0.95 0.03 245)` | `oklch(0.30 0.06 250)` | Hover, selected chip background (sky tint) |
| `--accent-foreground` | `oklch(0.393 0.139 257.3)` | `oklch(0.94 0.02 245)` | Text on accent (selected chip) |
| `--border` / `--input` | `oklch(0.91 0.01 257)` | `oklch(0.32 0.03 262)` | Lines, inputs |
| `--ring` | `oklch(0.614 0.152 244.2)` (sky `#008BD8`) | `oklch(0.688 0.135 240.8)` | Focus ring (2px, offset 2px) |
| `--brand-sky` | `oklch(0.614 0.152 244.2)` | `oklch(0.688 0.135 240.8)` | Progress fill, selected chip border, small accents (UI parts only) |
| `--brand-orange` | `oklch(0.703 0.179 52.9)` | `oklch(0.703 0.179 52.9)` | Decoration only, see the brand table |
| `--destructive` | `oklch(0.55 0.20 27)` | `oklch(0.68 0.18 25)` | Destructive actions and `ErrorCard` accents; never a verdict |
| `--verdict-good` | `oklch(0.52 0.13 155)` | `oklch(0.72 0.14 155)` | Green verdict fill, strong score bars |
| `--verdict-good-foreground` | `oklch(0.99 0 0)` | `oklch(0.183 0.031 263)` | Text on the good fill |
| `--verdict-good-muted` | `oklch(0.95 0.04 155)` | `oklch(0.28 0.05 155)` | Badge background; text on it uses `--verdict-good-strong` |
| `--verdict-good-strong` | `oklch(0.40 0.11 155)` | `oklch(0.82 0.12 155)` | Text on the muted badge |
| `--verdict-caution` | `oklch(0.795 0.163 87.6)` (`#E8B400`) | `oklch(0.82 0.15 90)` | Yellow verdict fill (Stellar's yellow; never amber, see the brand table) |
| `--verdict-caution-foreground` | `oklch(0.230 0.004 107)` (8.8:1 on the fill) | `oklch(0.20 0.03 90)` | Text on the caution fill (dark in both themes) |
| `--verdict-caution-muted` | `oklch(0.97 0.05 95)` | `oklch(0.30 0.06 90)` | Badge background |
| `--verdict-caution-strong` | `oklch(0.45 0.09 85)` | `oklch(0.88 0.13 92)` | Text on the muted badge |
| `--verdict-risk` | `oklch(0.55 0.20 27)` | `oklch(0.68 0.18 25)` | Red verdict fill, weak score bars |
| `--verdict-risk-foreground` | `oklch(0.99 0 0)` | `oklch(0.183 0.031 263)` | Text on the risk fill |
| `--verdict-risk-muted` | `oklch(0.95 0.03 25)` | `oklch(0.29 0.06 25)` | Badge background |
| `--verdict-risk-strong` | `oklch(0.45 0.17 27)` | `oklch(0.80 0.12 25)` | Text on the muted badge |

No `--sidebar-*` or `--chart-*` tokens: this design uses neither the shadcn sidebar nor shadcn charts; delete them if `shadcn init` adds them. Every pair above (each foreground on its background, in both themes) appears on `/design`, so the axe scan sees it.

- **Type**: Inter (variable, via `next/font/google`, `latin` and `latin-ext`, `display: "swap"`) as `--font-sans`; Geist Mono as `--font-mono`. Scale: Tailwind's default `text-xs` to `text-4xl` (12, 14, 16, 18, 20, 24, 30, 36px), no custom scale; 16px for body and composer. Body line height 1.5, headings 1.25. Weights 400, 500, 600 only. Remove the scaffold's Arial body rule.
- **Heading font** (updated 2026-11-21, **AC-16**): Montserrat, the BeamX brand font (variable, via `next/font/google`, `latin` and `latin-ext`, `display: "swap"`), as `--font-heading`, exposed to Tailwind as the `font-heading` utility through `@theme inline` in `globals.css`. Weight 600 only (the weight rule above still holds). Where it applies, and nowhere else:
  - a base rule in `globals.css` sets `h1, h2, h3, h4` to `--font-heading`, which covers page headings, the `ReportPanel` title, report section titles, and headings inside the chat's markdown;
  - the `font-heading` class on the titles that are not heading elements: `SheetTitle` in `ReportSheet`, the `CardFrame` prompt, the `ScoreHeader` title and score, the `ApprovalCard` title (confirm and stop cards), the `PrefillCard` title, the `ShortBalanceCard` title, and the `ErrorCard` title;
  - the rule for any new component: a title at 16px or larger in weight 600 gets `font-heading`; anything else stays Inter. Buttons, chips, answer options, the composer, labels, hints, progress text, the credit chip, and chat replies are always Inter.
  Montserrat is wider than Inter, so heading containers keep `min-w-0` and `wrap-anywhere`, and the 360px checks stay the gate.
- **Spacing**: Tailwind's 4px scale. Thread gap 16px; card padding 16px on mobile, 20px from 768px.
- **Radius**: `--radius: 0.625rem`, shadcn derived `sm`, `md`, `lg`, `xl`. Chips and the composer use `xl`.
- **Touch**: minimum 44 by 44px for every button, chip, input, menu item, checkbox row, and resize handle hit area. Override shadcn's default sizes in `src/components/ui/` (`button` default `h-11`, `sm` `h-11` on touch via `pointer-coarse:`, icon buttons `size-11`). Exempt: inline text links (like Edit), which meet the 24px WCAG 2.2 minimum.
- **Motion**: 150ms for hover and focus, 200ms for panel and sheet; ease out. A global `@media (prefers-reduced-motion: reduce)` rule in `globals.css` sets every animation and transition duration to near zero (AC-14).
- **Breakpoints**: Tailwind defaults; the split view starts at `lg` (1024px). Test widths: 360 and 1280 (768 is checked by hand, no AC depends on it).
- **Viewport**: export `viewport` from `src/app/layout.tsx` with `viewportFit: "cover"` and `interactiveWidget: "resizes-content"` (Android Chrome shrinks the page above the keyboard). The shell is `h-dvh`; the composer adds `pb-[env(safe-area-inset-bottom)]`. iOS Safari ignores `interactiveWidget`; there the composer relies on Safari's own scroll into view (accepted, not tested in CI).
- **Overflow**: message and card text use `break-words`; every flex child that holds text gets `min-w-0`, so long words and URLs never widen the page.
- **Icons**: `lucide-react` (shadcn's default). Verdict icons: check circle (good), alert triangle (caution), x octagon (risk). App icon and favicon come from `mark.png`.
- **Locale**: `en-NG`. Money is formatted with `Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })`. Tests compare after replacing non breaking spaces with plain spaces, since ICU versions differ.

### Component inventory and file layout

Respecting spec 0001's boundaries: `src/app/` holds routes only; shared UI lives in `src/components/`; a tool's own report view (feature #5) composes the shared report parts from its tool folder.

| Folder | Contents | Source |
|---|---|---|
| `src/components/ui/` | shadcn primitives: button, card, badge, input, textarea, radio-group, checkbox, progress, skeleton, sheet, dropdown-menu, resizable, scroll-area, separator, tooltip, collapsible (no `sidebar`: the rail is a plain `aside` plus a `Sheet` drawer) | `shadcn` CLI, Radix base, touch sizes overridden |
| `src/components/ai-elements/` | conversation (stick to bottom and its scroll button, used as "Jump to latest"), message and its streaming markdown response part (use the names the pinned registry version uses), prompt-input, shimmer, loader, suggestion | AI Elements CLI at a pinned version, recorded in `DESIGN.md`. Restyled with our tokens only. Strip attachments and model picking from prompt-input. Configure the markdown renderer with code highlighting, diagrams, and math off, and links opening in a new tab with `rel="noopener noreferrer"` |
| `src/components/workspace/` | `WorkspaceShell`, `Header`, `HistoryRail` (placeholder list, filled by #14), `ReportPanel`, `ReportSheet`, `ViewReportCard`, `Thread`, `Composer`, `RunProgressBar`, `StatusLine`, `ThemeToggle`, `BrandMark`, `useIsDesktop` (screen size hook) | Hand built on primitives |
| `src/components/answer-cards/` | `AnswerCard` (switch on `QuestionView.kind`), `SingleChoiceCard`, `MultiChoiceCard`, `ScaleCard`, `TextCard`, `AnsweredBubble`, `formatAnswer.ts` (pure) | Hand built |
| `src/components/report/` | `ScoreHeader`, `VerdictBadge`, `CategoryBars`, `AdviceList`, `ReportSection`, `ReportSkeleton` | Hand built, plain HTML and CSS |
| `src/components/feedback/` | `ErrorCard` | Hand built |
| `src/components/fixtures/` | Typed mock data for every state (questions of each kind, a streaming message, reports for each verdict, each error kind, a long Luna style run) | Used by `/design`, Vitest, Playwright |
| `src/app/design/page.tsx` | The showcase route | Route only, imports components and fixtures |
| `public/brand/` | `logo-original.png` (the source, 1421 by 799), `logo.png` (trimmed, 640 by 292, full "BeamX Solutions" lockup), `mark.png` (the X alone, 228 by 256, transparent). Already in the repo. If SVGs ever exist, they replace these with no code change beyond the file extension | Supplied by BeamX, trimmed from the original |
| `DESIGN.md` | The written design system (AC-1) | Written alongside the tokens, grown each milestone |
| `e2e/` + `playwright.config.ts` | Axe scans, keyboard walks, live region and reduced motion checks | Playwright (Chromium only) + `@axe-core/playwright` |

### Component contracts (the props interface, the only "API" this feature has)

These are TypeScript types in `src/components/answer-cards/types.ts` and `src/components/report/types.ts`, all `readonly`, validated with Zod where they cross a boundary in later features.

```ts
type QuestionView =
  | { kind: "single"; id: string; prompt: string; help?: string; options: readonly Option[] }
  | { kind: "multi"; id: string; prompt: string; help?: string; options: readonly Option[]; min: number; max: number }
  | { kind: "scale"; id: string; prompt: string; help?: string; min: number; max: number; minLabel: string; maxLabel: string }
  | { kind: "text"; id: string; prompt: string; help?: string; input: "text" | "number" | "money"; placeholder?: string; maxLength?: number; minValue?: number; maxValue?: number };
type Option = { value: string; label: string };
type AnswerValue = string | number | readonly string[];
type QuestionProgress = { area?: { index: number; total: number; name: string }; question: { index: number; total: number } };

// AnswerCard props: question, progress?, initialValue?, onSubmit(value), disabled?
// AnsweredBubble props: question, value, editable, onEdit()
// formatAnswer(question, value): string   (pure, unit tested)

type Verdict = "good" | "caution" | "risk";
// ScoreHeader: score, max, verdict, verdictLabel, summary
// CategoryBars: items: readonly { label: string; score: number; max: number; verdict?: Verdict }[]
// AdviceList: items: readonly { title: string; detail?: string; priority: "high" | "medium" | "low" }[]
// ReportSection: title, markdown, streaming?
// ReportSkeleton: steps: readonly { label: string; state: "pending" | "active" | "done" }[]
type ErrorKind = "ai_error" | "network" | "limit_reached" | "spend_cap";
// ErrorCard: kind, title, message, action: { label: string; onAction(): void } | { label: string; href: string }
//   (the kind picks the icon; the caller supplies the wording; exactly one action)
// RunProgressBar: toolName, done, total, onPause()   (role="progressbar", aria-valuenow/max, text "{done} of {total} questions")
// StatusLine: text (null hides it)

type MessageView = { id: string; role: "user" | "assistant"; markdown: string; streaming: boolean };
// Thread: messages: readonly MessageView[], status: string | null, children? (cards, ViewReportCard, ErrorCard slot in after the last message)
//   Owns the one aria-live="polite" region: when a message goes streaming → not streaming, it announces that message's full text once;
//   when status changes to a new non null text, it announces that text.
// Composer: onSend(text), hint?: string, disabled?: boolean, maxLength = 4000
//   Only reports onSend; what the text means (an answer, a side question) is decided by feature #7.
// WorkspaceShell: header: ReactNode, rail: ReactNode, report: ReactNode | null, reportTitle?: string, progress?: ReactNode, children (the Thread and Composer)
//   report null = no panel and no sheet. On desktop it renders the ReportPanel; on mobile the Thread shows a ViewReportCard that opens the ReportSheet.
// ViewReportCard: title, verdict?: Verdict, verdictLabel?: string, onOpen()
// ReportSheet: open, onOpenChange(open), title, children   (on close, focus returns to the ViewReportCard via onCloseAutoFocus)
// ReportPanel: title, children
// HistoryRail: items: readonly { id: string; title: string; href: string }[]   (placeholder data until feature #14)
// Header: menu contains ThemeToggle (Light, Dark, System radio items) and, below lg, a menu button that opens the HistoryRail drawer
// BrandMark: variant: "logo" | "mark"   (next/image of /brand/logo.png or /brand/mark.png, alt "BeamX Solutions";
//   logo at 28px tall in the header, mark at 28px in the collapsed rail and on phones under 400px wide.
//   Dark theme: the logo sits on a white rounded badge (px-2 py-1, radius md), because its blue and ink text vanish on dark;
//   the mark needs no badge, its strokes read on dark)
// useIsDesktop(): boolean   (matchMedia "(min-width: 1024px)"; returns false on the server and before mount, so the phone layout renders first)
```

**Layout rule**: the shell renders exactly one layout tree, picked by `useIsDesktop`, never desktop and mobile trees both present and hidden by CSS. If the screen crosses 1024px while the sheet is open, the sheet closes and the panel shows (and the reverse). `ThemeToggle` shows its current choice only after mount (`next-themes` has no theme on the server), so it never causes a hydration mismatch.

**Card behavior table**:

| Kind | Role and keys | Submits when | Validation | Value (`AnswerValue`) | `formatAnswer` output |
|---|---|---|---|---|---|
| `single` | radiogroup; arrows move, Space or Enter picks | on pick (one tap) | none | option `value` (string) | the option label |
| `multi` | group of checkboxes, Tab between them, Space toggles | on Confirm; disabled until `min` picks; unpicked options disabled at `max`; hint "Pick {min} to {max}" (or "Pick up to {max}" when `min` is 0) | count within `min..max` | option values in option order | labels in option order, joined with ", " |
| `scale` | radiogroup of numbered segments; arrows move | on pick (one tap) | none | the number | "{n} of {max}" |
| `text`, `input: "text"` | text field plus Submit button; Enter submits | on Submit or Enter | trimmed, not empty, at most `maxLength` (default 200); error shows on submit, under the field | trimmed string | the string |
| `text`, `input: "number"` | `inputMode="decimal"` field | same | a number within `minValue..maxValue` | number | grouped with `en-NG` (for example "1,250") |
| `text`, `input: "money"` | `inputMode="numeric"`, ₦ prefix shown beside the field, grouping applied on blur | same | whole naira, within `minValue..maxValue` | integer naira (not kobo) | money format (for example "₦250,000") |

Scales with more than 7 points wrap into two rows at 360px. A value that matches no option (stale data) formats as the raw value. Every card with `help` has a "What does this mean?" toggle (Radix collapsible) that reveals it. The parent (feature #7, fixtures here) owns whether a question shows as a card or a bubble; `AnswerCard` only reports `onSubmit`.

**Report part details**: `ScoreHeader` shows the score as a whole number with its max ("72/100"). `CategoryBars` show each value as text ("6/10") and fill with the verdict color when `verdict` is given, else `--primary`. `AdviceList` priority tags are neutral text badges ("High priority" uses `--primary`, Medium and Low use outline), never verdict colors. `ReportSkeleton` steps show an icon plus text state for each (done: check, "Done"; active: spinner, "In progress"; pending: empty circle, "Waiting"). `ReportSection` with `streaming` sets `aria-busy="true"` and shows the shimmer under the last line.

There are no new endpoints, Server Actions, or database calls in this feature.

**Data model sketch**: none. This feature stores nothing; the only persisted value is the theme choice, which `next-themes` keeps in the browser's `localStorage` under the key `theme`.

**State transitions** (client side UI state only):
- Answer card: `open → submitted (collapsed bubble) → open again on Edit (only while editable)`.
- Report surface: `none → generating (skeleton with steps) → ready | failed (ErrorCard with Retry)`.
- Thread scroll: `following bottom ⇄ detached (client scrolled up, Jump to latest shown)`.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/design` | GET (page) | none | Showcase of every token and component | Public, but only exists when `ENABLE_DESIGN_PAGE=true` | 404 when the flag is off |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Theme | Light, dark, or system | `next-themes` (`localStorage.theme`, else `prefers-color-scheme`) |
| Answer card | Prompt, options, scale bounds, input kind | `QuestionView` prop (real values come from the tool contract, feature #5; fixtures here) |
| Answer card | "Area x of y · Question n of m" | `QuestionProgress` prop (from run state, features #7 and #12) |
| Answered bubble | The readable answer, for example "Retail, 6 to 20 staff" or "₦250,000" | Derived by `formatAnswer(question, value)` from option labels and the `en-NG` money format |
| Answered bubble | Whether Edit shows | `editable` prop (true until the run is scored, set by feature #7 from the run status in spec 0002) |
| Run progress bar | Tool name, done, total | Props from run state (feature #7) |
| Status line | Status text, for example "Scoring your answers…" | `text` prop (the assistant layer picks it, feature #6) |
| Score header | Score, max, verdict, verdict label, summary | Props from the tool's report view (feature #5). The tool maps its own verdict words (Stellar's green, yellow, red) to `Verdict`; `verdictLabel` carries the tool's own wording |
| Category bars | Bar width | Derived: `score / max`, clamped to 0..1 |
| Report skeleton | Step labels and states | `steps` prop (from report status, spec 0002 `pending → generating → ready or failed`) |
| Error card | Message and action | Props; each feature maps its typed `{ ok: false, error }` codes to a title, message, and one action |
| Composer | Character count and limit | Derived from the text (`text.length`); limit 4,000 from spec 0001 (as the `maxLength` default, the real value comes from config in feature #21) |
| `/design` | Whether the route exists | `ENABLE_DESIGN_PAGE`, read through `src/lib/env.ts` |
| Brand mark | Logo image | `public/brand/logo.png` and `mark.png` (trimmed from BeamX's logo); the dark theme badge is decided in the `BrandMark` contract |
| Thread live region | Announced text | Derived: the full `markdown` of a `MessageView` when `streaming` turns false; the `status` text when it changes |
| Composer | Whether Enter sends | Derived from `matchMedia("(pointer: coarse)")` and `event.nativeEvent.isComposing` |
| Shell | Desktop or phone layout | `useIsDesktop()` (matchMedia, phone first on the server) |
| Error card | Icon | Derived from `kind` |

**Key invariants**:
- Only tokens style components: no raw hex, `rgb`, `oklch`, or Tailwind palette colors (`bg-blue-600`) in `src/components/` or `src/app/` (except token definitions in `globals.css`). A CI step searches for them and fails the build. Verdict colors are used only for verdicts and score bars.
- Every token named in `DESIGN.md` exists in `globals.css`: a Vitest test reads both files and compares the `--token` names.
- Generated shadcn and AI Elements code follows the same lint, format, and strict TypeScript rules as our code (no ignore lists); fix any `any` it brings in.
- A verdict always shows icon plus label plus color, never color alone.
- AI Elements files are restyled, not rewritten; updating one from the registry must not lose BeamX behavior (keep BeamX additions in our own wrapper components).
- Every shared component has a `/design` entry for each of its states, and a `DESIGN.md` section. Every token pair appears on `/design` in both themes.
- No chart or animation library; bars and gauges are HTML and CSS.
- The root layout and `/design` touch no database, auth, or AI, so `/design` builds and runs with `SKIP_ENV_VALIDATION=1` in CI.

**Security model**: no user data is read or written. `/design` shows only fixtures and is off unless the flag is set; set it to `true` locally and in Preview deploys, leave it unset in Production. Streamed markdown is rendered by AI Elements' response component (no raw HTML), so model output cannot inject script.

**Configuration required**:
- `ENABLE_DESIGN_PAGE`: optional, `"true"` turns on the `/design` route (local, Preview, and the CI e2e job). Add to the Zod schema in `src/lib/env.ts` as `z.stringbool().default(false)`, add it to the hand built `SKIP_ENV_VALIDATION` branch of the same file (`process.env.ENABLE_DESIGN_PAGE === "true"`), and to `.env.example`. With Cache Components the page is rendered at build time, so the flag must be set **when building**; changing it on Vercel needs a redeploy.

**Critical test scenarios**:
- Happy path: on `/design` at 360px, Tab into a single choice card, arrow to an option, press Enter; the card collapses into a bubble with the right label; press Edit and the option is still selected, verifies **AC-8**, **AC-9**
- Contrast and themes: axe scan of `/design` in light and dark at 360px and 1280px reports zero A or AA violations, verifies **AC-3**, **AC-15**
- Theme persistence: pick Dark, reload; `html` has the `dark` class in the very first HTML response handling (checked before hydration with an init script), verifies **AC-2**
- Token check (Vitest): every `--token` in `DESIGN.md` exists in `globals.css`, verifies **AC-1**
- Mobile report: at 360px, open "View report", press Escape; the sheet closes and focus is back on the card; the page has no horizontal scroll, verifies **AC-5**
- Desktop panel: at 1280px, focus the resize handle, press Left arrow; the panel grows and never shrinks under 360px, verifies **AC-4**
- Composer: 4,001 characters disables Send and shows the counter; on desktop Shift+Enter adds a line and Enter sends; with a touch (`hasTouch`, coarse pointer) context Enter adds a line, verifies **AC-7**
- Live region: a fixture message finishing streaming puts its full text in the live region once, verifies **AC-6**
- Reduced motion: with `reducedMotion: "reduce"`, opening the sheet has no running animation (`getAnimations()` is empty), verifies **AC-14**
- Overflow: a fixture message with a 200 character URL causes no horizontal scroll at 360px, verifies **AC-5**
- Failure case: each fixture error kind renders an `ErrorCard` with one action, never an empty area, verifies **AC-12**
- Flag off: `/design` returns 404 when `ENABLE_DESIGN_PAGE` is unset, verifies **AC-13**
- Unit: `formatAnswer` covers every `QuestionView.kind`, money formatting, and multi choice ordering, verifies **AC-9**

## Build plan

Ordered as a Tracer Bullet (the project default): the first milestone pushes one thin thread through every layer (tokens, theme, a component, the `/design` route, the env flag, Playwright, axe, CI), then each later milestone thickens one strand.

**Milestone 1: Thin thread, tokens to CI**
1. Run `shadcn init` with the Radix base (spec 0001), `src/components/ui` alias, CSS variables on; add `button`, `card`, `badge`, `dropdown-menu`, `skeleton`; override their sizes for 44px touch targets; delete any `--sidebar-*` and `--chart-*` tokens it writes, satisfies **AC-2**, **AC-3**
2. Write the light and dark tokens in `src/app/globals.css` from the table above; switch fonts to Inter and Geist Mono in `src/app/layout.tsx`; drop the Arial rule; add the global reduced motion rule and the `viewport` export, satisfies **AC-1**, **AC-3**, **AC-14**
3. Add `next-themes` (`ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, `suppressHydrationWarning` on `<html>`; toggle shows its state only after mount) and `ThemeToggle`, satisfies **AC-2**
4. Add `ENABLE_DESIGN_PAGE` to `src/lib/env.ts` (schema and the skip branch) and `.env.example`; create `src/app/design/page.tsx` that calls `notFound()` when off and shows the token swatches, type scale, and buttons, satisfies **AC-13**
5. Install Playwright and `@axe-core/playwright`; add `playwright.config.ts` (projects at 360 by 800 and 1280 by 800, light and dark color schemes) and `e2e/design.spec.ts` with the axe scan and the theme reload check; add an `e2e` script and a CI job that sets `SKIP_ENV_VALIDATION=1` and `ENABLE_DESIGN_PAGE=true` for **both** `pnpm build` and `pnpm start`, installs Chromium (`playwright install --with-deps chromium`, cached), runs the suite against `http://localhost:3000`, and uploads the HTML report (not marked required, see AC-15). Add the raw color search step and the Vitest token test, satisfies **AC-1**, **AC-3**, **AC-15**
6. Start `DESIGN.md` with feel, tokens, type, spacing, radius, motion, and breakpoints, satisfies **AC-1**

**Milestone 2: Workspace shell**
7. Add `sheet`, `resizable`, `scroll-area`, `separator`, `tooltip`; build `BrandMark` from the PNGs in `public/brand/` (with the dark theme badge) and generate `src/app/icon.png` and `apple-icon.png` from `mark.png`; build `useIsDesktop`, `Header`, `BrandMark`, and `WorkspaceShell` (one layout tree; `HistoryRail` as an `aside` at 16rem or 3.5rem at `lg`, a `Sheet` drawer below; chat column at 48rem max), satisfies **AC-4**, **AC-5**
8. Build `ReportPanel` (resizable, 45% default, 360px minimum in pixels, 60% maximum, chat 360px minimum; check that the installed `react-resizable-panels` supports pixel sizes, else compute percentages from the container width; rail auto collapse below 1280px), `ReportSheet` (full screen, closes on Escape, focus back to `ViewReportCard` via `onCloseAutoFocus`, switches to the panel when crossing 1024px), and `ViewReportCard`; apply `h-dvh`, safe area padding, `break-words`, and `min-w-0`, satisfies **AC-4**, **AC-5**, **AC-14**
9. Show the shell on `/design` with fixtures in both report states; add Playwright checks for no horizontal scroll at 360px, sheet focus return, and keyboard resize, satisfies **AC-4**, **AC-5**, **AC-15**

**Milestone 3: Chat thread, composer, and answer cards**
10. Add AI Elements at a pinned registry version (conversation, message with its streaming response part, prompt-input, shimmer, loader, suggestion); record the version in `DESIGN.md`; restyle with tokens only; turn off code highlighting, diagrams, and math in the markdown renderer; build `Thread` (with the live region from the contracts) and `StatusLine`, satisfies **AC-6**, **AC-14**
11. Build `Composer` on prompt-input (attachments and model picking removed): 16px text, auto grow to 6 lines, Enter rules by pointer type and `isComposing`, 4,000 character limit with "3,712 / 4,000" counter past 3,600, `hint` prop, satisfies **AC-7**
12. Build `QuestionView` types, the four cards per the card behavior table (with the help toggle and focus moves), `AnsweredBubble`, and `formatAnswer` with Vitest unit tests for every row of the table; build `RunProgressBar`, satisfies **AC-8**, **AC-9**, **AC-10**
13. Add their `/design` entries (every kind, answered, editable and locked, long Luna style progress) and Playwright keyboard walks, satisfies **AC-8**, **AC-9**, **AC-15**

**Milestone 4: Report parts, errors, and the finished `DESIGN.md`**
14. Build `VerdictBadge`, `ScoreHeader`, `CategoryBars`, `AdviceList`, `ReportSection` (streaming markdown), and `ReportSkeleton` with steps, satisfies **AC-3**, **AC-11**, **AC-14**
15. Build `ErrorCard` and fixtures for the four kinds (`ai_error`, `network`, `limit_reached`, `spend_cap`) with their wording and single action, shown in thread and panel, plus a failed report in the panel (`ai_error` with Retry), satisfies **AC-12**
16. Finish `DESIGN.md` with a section per component (props, states, usage rules, do and don't), and check every token name against `globals.css`, satisfies **AC-1**
17. Run the full Playwright suite and fix any axe findings by adjusting token lightness, satisfies **AC-3**, **AC-15**

**Milestone 5 (2026-11-21): Montserrat headings**
18. Load Montserrat with `next/font/google` in `src/app/layout.tsx` as `--font-heading` (weight 600, `latin` and `latin-ext`, `display: "swap"`); add `--font-heading` to `@theme inline` and the `h1` to `h4` base rule in `globals.css`; add `font-heading` to the titles listed under **Heading font**; update the type section of `DESIGN.md` (both fonts, where each applies, the 16px and 600 rule) and the `/design` type scale; keep `design-tokens.test.ts` passing with the new token; run the full Playwright suite (axe, 360px, both themes), satisfies **AC-1**, **AC-3**, **AC-16**

## Consequences

**Positive**:
- Every later feature composes ready parts instead of inventing styles; feature #7 only wires `useChat`, the database, and real tool data into a shell that already works on phones.
- Accessibility and small screen behavior are tested in CI from day one, so regressions are caught on the PR, not by a client.
- Tokens make dark mode, a later rebrand, and the PDF look (feature #15) a change in one file.

**Negative / tradeoffs**:
- The colors come from the logo, not a brand guide (none exists). If BeamX later publishes official values, the tokens and `DESIGN.md` change (cheap, one file).
- The logo exists only as a PNG: it is blurry above about 2x its display size and needs a white badge in dark mode. A vector (SVG) version would fix both.
- AI Elements files live in our repo; registry updates must be merged by hand, and restyling them means knowing which bits are ours.
- Playwright adds a Chromium install and about a minute or two to CI. It runs Chromium only, so Safari (iOS) behavior, such as the keyboard and the composer, is checked by hand.
- The `/design` flag is fixed at build time, so turning the page on or off on Vercel needs a redeploy.
- Building the shell on fixtures before real data means feature #7 may find a prop it needs that is missing; that is a small contract change here, not a rewrite.
- `QuestionView` is defined here before the tool contract (feature #5) exists; #5 must adopt it or map to it.

**Neutral**:
- New dependencies: `next-themes`, `lucide-react`, Radix packages (through shadcn), `react-resizable-panels` (through shadcn `resizable`), AI Elements' own (including its streaming markdown renderer), `@playwright/test`, `@axe-core/playwright`.
- `DESIGN.md` becomes a document every UI change must keep current.

## Follow-up

- [ ] If BeamX ever gets a vector logo (SVG) or a white version for dark backgrounds, swap it into `public/brand/` and drop the dark theme badge.
- [ ] Check that the spec 0001 Stellar verdict wording maps cleanly to the yellow caution token (feature #7).
- [ ] Feature #12 (Luna) adds the paused state to `RunProgressBar` (a Resume action); this spec ships Pause only.
- [ ] Feature #8 replaces the `/sign-up` placeholder link in the `limit_reached` error card.
- [ ] Feature #5 (tool contract) adopts `QuestionView`, `AnswerValue`, and the report part props from this spec, or maps to them in one place.
- [ ] Feature #20: confirm from each tool's source that the four card kinds cover every question; any new kind comes back here as a spec update.
- [ ] Feature #15 (report PDF) reuses these tokens, `logo.png`, and the HTML and CSS bar approach for a matching branded PDF.
- [ ] Set `ENABLE_DESIGN_PAGE=true` for the Preview environment in Vercel; leave it unset in Production.
- [ ] For `AGENTS.md` (`/sync` owns the edit): the rule "style only with tokens from `DESIGN.md`, never raw colors", the component folders above, and `Declined:` Agent Skills for `next-themes` and `@axe-core/playwright`.
- [ ] The full WCAG audit stays deferred in the scope; this spec covers the base components only.
- [ ] Feature #15 (report PDF) uses Montserrat for its headings too, so the PDF matches the app (AC-16).
- [ ] If the repo moves to GitHub Pro or Team, or goes public, make the `e2e` job a required check on `main` (branch protection) and restore that wording in AC-15.
