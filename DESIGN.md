# BeamX Workspace design system

The look and the building blocks of the BeamX Workspace. Spec: [0003](docs/specs/0003-design-system-ui-foundation/index.md). Token values live in `src/app/globals.css` (the source of truth for values); this file is the source of truth for names, rules, and intent. Every token named here must exist there (a Vitest test checks it). See it all on `/design` (needs `ENABLE_DESIGN_PAGE=true` at build time).

## Feel

A calm, trusted advisor. Mostly neutral surfaces, the BeamX royal blue from the logo as the one strong color, sky blue for focus and progress, and a small touch of orange. Green, yellow, and red are kept for score verdicts only. Medium rounded corners, Inter, plenty of space.

**Rule: style only with tokens.** No raw hex, `rgb`, `oklch`, or Tailwind palette colors (`bg-blue-600`) in `src/components/` or `src/app/`. A CI step fails the build if it finds one.

## Brand colors (sampled from `public/brand/logo-original.png`)

| Brand color | Hex       | Role                                                                                                         |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| Royal blue  | `#02428E` | Light theme `--primary`: buttons, links, user bubble                                                         |
| Sky blue    | `#008BD8` | `--brand-sky` and `--ring`: focus ring, progress fill, selected chip border. UI parts only, never small text |
| Orange      | `#F27900` | `--brand-orange`: small accents only. Never text, never the only sign of a state                             |
| Ink         | `#1D1D1B` | Light theme `--foreground`                                                                                   |

The caution verdict is yellow (hue about 90), not amber, so a score is never mistaken for the brand orange.

## Color tokens

All are CSS variables in `oklch`, switched by the `dark` class on `<html>`. If a value fails the axe contrast check, change its lightness only and update this file in the same change.

| Token                          | Use                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `--background`                 | Page                                                                                 |
| `--foreground`                 | Body text                                                                            |
| `--card`                       | Cards                                                                                |
| `--card-foreground`            | Text on cards                                                                        |
| `--popover`                    | Menus                                                                                |
| `--popover-foreground`         | Text on menus                                                                        |
| `--secondary`                  | Secondary buttons, neutral badges                                                    |
| `--secondary-foreground`       | Text on secondary                                                                    |
| `--muted`                      | Assistant bubble, skeleton                                                           |
| `--muted-foreground`           | Secondary text                                                                       |
| `--primary`                    | Brand, primary buttons, links, user bubble                                           |
| `--primary-foreground`         | Text on primary                                                                      |
| `--accent`                     | Hover, selected chip background                                                      |
| `--accent-foreground`          | Text on accent                                                                       |
| `--border`                     | Lines                                                                                |
| `--input`                      | Input borders                                                                        |
| `--ring`                       | Focus ring (2px, offset 2px)                                                         |
| `--brand-sky`                  | Progress fill, selected chip border, small accents                                   |
| `--brand-orange`               | Decoration only                                                                      |
| `--logo-badge`                 | White badge behind the logo PNG in dark theme (its blue and ink text vanish on dark) |
| `--destructive`                | Destructive actions and error card accents. Never a verdict                          |
| `--verdict-good`               | Green verdict fill, strong score bars                                                |
| `--verdict-good-foreground`    | Text on the good fill                                                                |
| `--verdict-good-muted`         | Badge background                                                                     |
| `--verdict-good-strong`        | Text on the muted badge                                                              |
| `--verdict-caution`            | Yellow verdict fill                                                                  |
| `--verdict-caution-foreground` | Text on the caution fill (dark in both themes)                                       |
| `--verdict-caution-muted`      | Badge background                                                                     |
| `--verdict-caution-strong`     | Text on the muted badge                                                              |
| `--verdict-risk`               | Red verdict fill, weak score bars                                                    |
| `--verdict-risk-foreground`    | Text on the risk fill                                                                |
| `--verdict-risk-muted`         | Badge background                                                                     |
| `--verdict-risk-strong`        | Text on the muted badge                                                              |

A verdict is never shown by color alone: it always carries an icon (check circle for good, alert triangle for caution, x octagon for risk) and a text label. There are no `sidebar` or `chart` tokens: this design uses neither.

## Type

Inter (variable, `latin` and `latin-ext`) as `--font-sans`; Geist Mono as `--font-mono`. Tailwind's default scale `text-xs` to `text-4xl` (12, 14, 16, 18, 20, 24, 30, 36px). 16px for body and the composer, so phones never zoom in. Body line height 1.5, headings 1.25. Weights 400, 500, 600 only.

## Spacing

Tailwind's 4px scale. Thread gap 16px. Card padding 16px on mobile, 20px from 768px.

## Radius

`--radius` is 0.625rem; `sm`, `md`, `lg`, `xl` derive from it. Chips and the composer use `xl`.

## Touch

Every button, chip, input, menu item, checkbox row, and resize handle hit area is at least 44 by 44px. The shadcn sizes in `src/components/ui/` are overridden for this (`button` default `h-11`, icon buttons `size-11`, smaller sizes grow on `pointer-coarse`). Inline text links are exempt (24px minimum, WCAG 2.2).

## Motion

150ms for hover and focus, 200ms for panel, sheet, and drawer, ease out. One global `prefers-reduced-motion: reduce` rule in `globals.css` turns every animation and transition off (shimmer, skeleton pulse, panel, sheet, drawer, and the Radix and `tw-animate-css` ones). Content still appears.

## Breakpoints

Tailwind defaults. The split view (rail, chat, report panel) starts at `lg` (1024px). Tested widths: 360 and 1280.

## Theme

`next-themes` with the `dark` class on `<html>`, default System. The header menu offers Light, Dark, and System; the choice is kept in `localStorage` under `theme`. No flash: the library's init script sets the class before first paint.

## Icons and brand marks

`lucide-react`. Logo files in `public/brand/` (PNG only, so the dark theme shows the logo on a white badge).

## Locale

`en-NG`. Money is whole naira, `Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })`.

## Components

Every shared component has a section here (props, states, usage rules) and an entry on `/design` for each state. Foundations first (primitives, the shell), then the chat parts, the report parts, and errors. Do not invent a new look: compose these, and add a section here in the same change when you add one.

### Primitives

`button`, `card`, `badge`, `dropdown-menu`, `skeleton`, `checkbox`, `collapsible`, `input`, `textarea`, `progress`, `sheet`, `resizable`, `scroll-area`, `separator`, `tooltip` from shadcn (Radix base), in `src/components/ui/`. Sizes are overridden for 44px touch targets. They follow the same lint and strict TypeScript rules as our code.

### ThemeToggle

`ThemeToggle()`. A header menu with Light, Dark, and System radio items. It shows the current choice only after mount (`next-themes` has no theme on the server), so it never causes a hydration mismatch.

### BrandMark

`BrandMark({ variant: "logo" | "mark", className? })`. `logo` is the full lockup at 28px tall in the header; `mark` is the X alone, used in the collapsed rail and on phones under 400px wide. Alt text is "BeamX Solutions". In the dark theme the logo sits on a white rounded badge (`--logo-badge`), because its blue and ink text vanish on dark. Do not recolor the files.

### WorkspaceShell

`WorkspaceShell({ header, rail, report, reportTitle?, progress?, children })`. `children` are the Thread and the Composer. `report` is a node, or `null` for no panel and no sheet.

- It renders exactly one layout tree, picked by `useIsDesktop`, never both hidden by CSS. The server and the first paint use the phone layout.
- At 1024px and up: the `HistoryRail` (16rem open, 3.5rem collapsed), the chat column, and a resizable `ReportPanel` when `report` is set. Below 1280px the rail collapses on its own when the panel opens. Panel width and rail state are not saved.
- Below 1024px: one column, the rail as a drawer from a menu button, the report in a full screen `ReportSheet` opened from a `ViewReportCard` in the thread.
- With no report, the chat column is centered at 48rem max.
- It is `h-dvh`; the viewport is set with `viewportFit: "cover"` and `interactiveWidget: "resizes-content"`, so the composer stays above the Android keyboard. iOS Safari ignores `interactiveWidget` and relies on its own scroll into view (not tested in CI).

Usage rules: text containers use `min-w-0` and `wrap-anywhere`, so long words and URLs wrap instead of widening the page.

### Header

`Header({ children? })`. The brand mark, a menu button below `lg` that opens the history drawer, and a menu holding the `ThemeToggle`. `children` go beside the menu (the run progress bar is passed to the shell, not here).

### HistoryRail

`HistoryRail({ items })` with `items: { id, title, href }[]`. An `aside` on desktop, a `Sheet` drawer on phones. It shows placeholder data until feature #14 fills it.

### ReportPanel

`ReportPanel({ title, children })`. The report beside the chat on desktop: a titled region with its own scroll. In the shell it sits in a resizable panel: 45% wide by default, never under 360px or over 60%, and the chat column never under 360px. The handle resizes by mouse and by arrow keys, with a 44px hit area.

### ReportSheet

`ReportSheet({ open, onOpenChange, title, children })`. The phone version of the report: full screen, closed by its close button or Escape. Focus returns to the `ViewReportCard` that opened it. If the screen grows past 1024px while it is open, it closes and the panel shows.

### ViewReportCard

`ViewReportCard({ title, verdict?, verdictLabel?, onOpen? })`. A tappable card in the thread that opens the report sheet. With a verdict it shows a `VerdictBadge`. Inside a `WorkspaceShell` it opens the sheet on its own; `onOpen` overrides that.

### useIsDesktop

`useIsDesktop(): boolean`. `matchMedia("(min-width: 1024px)")`; false on the server and before mount.

### AI Elements

Added from the registry (`https://elements.ai-sdk.dev`, `ai-elements` CLI 1.9.1, installed 2026-11-18): `conversation`, `message`, `shimmer`, `suggestion`. They are restyled with our tokens only, and kept small on purpose:

- `loader` does not exist in the registry. A status line uses `Shimmer`; a spinner is not needed yet.
- `prompt-input` (1,400 lines of attachments, model picking, and speech) is not used. `Composer` is built directly on the textarea and button primitives, since the spec strips those parts anyway.
- `shimmer` is pure CSS (`.shimmer` in `globals.css`) instead of the `motion` library, so the one reduced motion rule turns it off. No animation library ships.
- `conversation` drops `role="log"` (an implicit live region that would read every token), adds a focusable scroll area, scrolls instantly, and uses a "Jump to latest" button. Download is removed.
- `message` drops branching and the `ai` package types; `MessageResponse` has no code, diagram, math, or CJK plugins and no copy or download controls. Links open in a new tab with `rel="noopener noreferrer"`. Raw HTML is never rendered.
- Registry updates must be merged by hand. BeamX behavior lives in `src/components/workspace/` wrappers where possible.

### Thread

`Thread({ messages, status, children, label? })`. `messages` are `{ id, role, markdown, streaming }`. Assistant text renders as streaming markdown on the muted surface; the user's text is plain on `--primary`. Cards, the "View report" card, and error cards go in `children`, after the last message.

States: empty, streaming (the message has `aria-busy`), idle, scrolled up (shows "Jump to latest"). It sticks to the bottom while text streams, unless the reader scrolled up.

Live region: the Thread owns the only `aria-live="polite"` region. A finished assistant reply is announced once, in full, when `streaming` turns false; each new status text is announced when it changes. Replies never announce token by token. Do not add another live region inside the thread.

### StatusLine

`StatusLine({ text })`. Plain text with a shimmer, for example "Scoring your answers…". `null` hides it. It is not a live region itself (the Thread announces it).

### Composer

`Composer({ onSend, hint?, disabled?, maxLength = 4000, ref? })`. The `ref` exposes `focus()`.

- Grows with its text up to 6 lines, then scrolls. 16px text.
- Desktop (fine pointer): Enter sends, Shift+Enter adds a line. Touch screens (coarse pointer): Enter adds a line; only Send sends. Enter never sends while a word is being composed (`isComposing`).
- Send is off for empty (trimmed) text and for text over `maxLength`. A counter like "3,712 / 4,000" shows past 90% of the limit, at 16px.
- `hint` shows small text above the field, like "Or type your answer" while an answer card is open. The composer stays usable while a card is open.
- `onSend` gets the trimmed text only. What it means is the caller's job. After a card is answered, the caller moves focus here with `ref.current.focus()`.
- Pads for the phone safe area.

### Answer cards

All four kinds render from one `QuestionView` (`src/components/answer-cards/types.ts`): `AnswerCard({ question, progress?, initialValue?, onSubmit, disabled? })`. The card only reports `onSubmit`; the parent decides whether a question shows as a card or as an `AnsweredBubble`.

| Kind                               | Control                              | Submits when                                                                                                                     |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `single`                           | Chips in a radio group               | One tap                                                                                                                          |
| `multi`                            | Checkbox rows, hint "Pick 2 to 4"    | Confirm, off until `min` picks; unpicked rows blocked at `max`                                                                   |
| `scale`                            | Numbered joined segments, end labels | One tap. One row up to 7 points, two balanced rows past that                                                                     |
| `text` (`text`, `number`, `money`) | Field and Submit                     | Submit or Enter. Validated on submit with a short message under the field. Money is whole naira with a ₦ prefix, grouped on blur |

- Radio groups (single, scale) are hand built: arrow keys only move focus; Space or Enter picks. One Tab stop. (Radix radios select on arrow keys, which would submit by accident.)
- Every card with `help` has a "What does this mean?" toggle.
- Progress reads "Marketing · Area 3 of 9 · Question 4 of 7", or "Question 4 of 7" with no area. Counts start at 1.
- Every control is at least 44 by 44px (checkbox rows are 44px tall; the box is a 20px visual inside).
- When `initialValue` is passed (editing), the selected control gets focus.
- `formatAnswer(question, value)` (pure) turns a value into the bubble text; an unknown value shows raw.

### AnsweredBubble

`AnsweredBubble({ question, value, editable, onEdit })`. The user's reply bubble on `--primary`. An "Edit" link shows only while `editable` is true (until the run is scored); it is an inline text link (24px minimum). Reopen the card with `initialValue` set to the old answer.

### RunProgressBar

`RunProgressBar({ toolName, done, total, onPause })`. A thin bar pinned under the header: tool name, "{done} of {total} questions", and Pause. It is a `progressbar` with `aria-valuenow` and `aria-valuemax`. Render it only while a run is active. Paused state with Resume comes with Luna (feature #12).

## Report parts

Plain HTML and CSS, no chart or animation library. They are rendered from props by a tool's report view (feature #5). The tool maps its own verdict words (Stellar's green, yellow, red) to `Verdict` (`good`, `caution`, `risk`) and passes its own label.

### VerdictBadge

`VerdictBadge({ verdict, label, className? })`. Icon, text label, and color together: check circle for good, alert triangle for caution, x octagon for risk. A verdict is never color alone. Icons and colors come from one place, `src/components/report/verdict.ts`.

Use verdict colors only for verdicts and score bars. Never for errors (use `--destructive`) or decoration.

### ScoreHeader

`ScoreHeader({ score, max, verdict, verdictLabel, summary })`. The score as a whole number over its max ("72/100"), the badge, and a one or two sentence summary.

### CategoryBars

`CategoryBars({ items, label? })` with `items: { label, score, max, verdict? }[]`. Each row shows the label, the value as text ("6/10"), and a bar. The bar width is `score / max`, clamped to 0..1 (bad input gives an empty bar). The fill is the verdict color when `verdict` is given, else `--primary`. The bar is decorative (`aria-hidden`); the text carries the value.

### AdviceList

`AdviceList({ items, label? })` with `items: { title, detail?, priority: "high" | "medium" | "low" }[]`. A numbered list of cards. Priority tags are neutral text badges: "High priority" is filled with `--primary`; "Medium priority" and "Low priority" are outlined. Never verdict colors.

### ReportSection

`ReportSection({ title, markdown, streaming? })`. A long written part. It renders streaming markdown through the same safe renderer as chat (no raw HTML, no code highlighting, links open in a new tab). While `streaming`, it sets `aria-busy="true"` and shows a shimmer line under the text.

### ReportSkeleton

`ReportSkeleton({ steps })` with `steps: { label, state: "pending" | "active" | "done" }[]`. Placeholder blocks plus the named steps. Each step shows an icon and its state as text: done is a check and "Done", active is a spinner and "In progress", pending is an empty circle and "Waiting". The report state moves `none → generating (skeleton) → ready | failed (ErrorCard with Retry)`.

## Errors

### ErrorCard

`ErrorCard({ kind, title, message, action })`. One card for every expected failure, inline in the thread or the panel. A neutral card with a destructive border and icon (never verdict colors), a short plain message, and exactly one primary action. `action` is `{ label, onAction }` or `{ label, href }`.

| Kind            | Icon        | Default action label  | Behavior                                              |
| --------------- | ----------- | --------------------- | ----------------------------------------------------- |
| `ai_error`      | cloud alert | Retry                 | `onAction` retries the step                           |
| `network`       | wifi off    | Retry                 | `onAction` retries the call                           |
| `limit_reached` | user plus   | Sign up to keep going | `href` to `/sign-up` (a placeholder until feature #8) |
| `spend_cap`     | gauge       | Got it                | `onAction` dismisses the card                         |

The kind picks the icon; the caller supplies the wording (defaults in `src/components/feedback/error-copy.ts`, so the tone stays the same). A failure never renders a blank area and never relies on a toast. The card is not a live region: the Thread owns the one live region, so set the thread status text when a failure should be spoken. Each feature maps its typed `{ ok: false, error }` codes to a kind, a title, a message, and one action.

## Fixtures

Typed mock data for every state lives in `src/components/fixtures/` (`chat.ts`, `shell.ts`, `report.ts`). `/design`, Vitest, and Playwright all read it, so a state is written once.

## Checks

- `src/components/design-tokens.test.ts` (Vitest): every token named in backticks in this file exists in `globals.css`, in both themes.
- `pnpm check:colors`: no raw colors in `src/components/` or `src/app/`.
- Playwright (`pnpm e2e`, Chromium, 360 and 1280px, light and dark, against a production build with `ENABLE_DESIGN_PAGE=true`): axe scans with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` tags, keyboard walks, live region text, reduced motion, and the 360px overflow checks. It runs on every PR as a required check.
