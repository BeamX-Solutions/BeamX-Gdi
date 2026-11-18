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

Sections per shared component (props, states, usage rules) are added as each one lands. Built so far: the shadcn primitives `button`, `card`, `badge`, `dropdown-menu`, `skeleton` with 44px touch sizes, and `ThemeToggle`.
