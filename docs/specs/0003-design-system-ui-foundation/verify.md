# Verify: design system & UI foundation · spec 0003 · updated 2026-11-18

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Milestone 3 (chat thread, composer, answer cards) is covered below; the other milestones add their steps when they land. Run against a production build with `ENABLE_DESIGN_PAGE=true` and `SKIP_ENV_VALIDATION=1` set at build and start._

## UI / manual

- [ ] `/design` at 360px → "Live conversation": Tab to the first chip, press ArrowRight, then Enter. Expect the card collapses into a bubble "Food and drinks", focus is in the composer, and arrows alone never submitted → AC-8, AC-9
- [ ] Press Edit on that bubble → expect the card reopens with "Food and drinks" selected and focused → AC-9
- [ ] "What does this mean?" on the card → expect the help text appears; press again and it hides → AC-8
- [ ] Multi choice card ("How do customers find you today?") → expect hint "Pick 2 to 4", Confirm disabled until 2 picks, the fifth box blocked after 4, bubble lists labels in option order → AC-8
- [ ] Scale card (5 points) → tap 4, expect bubble "4 of 5". Scale card (0 to 10) → expect two rows, no empty grey cell → AC-8
- [ ] Money card → submit empty and expect an error under the field; type 250000, leave the field and expect "250,000"; press Enter and expect bubble "₦250,000" → AC-8
- [ ] Number card → type 0, Submit, expect "Enter 1 or more." → AC-8
- [ ] "Answered bubble, locked" → answer it and expect no Edit link → AC-9
- [ ] Every chip, segment, checkbox row, input, Confirm, Submit, Send and Pause is at least 44 by 44px (the Edit link is exempt) → AC-8
- [ ] Composer: with 3,712 characters expect "3,712 / 4,000" at 16px; with 4,001 expect Send disabled; 12 lines grow to 6 lines then scroll → AC-7
- [ ] Desktop: Shift+Enter adds a line, Enter sends. Touch device (or `hasTouch` and `isMobile`): Enter adds a line, only Send sends. During IME composition Enter never sends → AC-7
- [ ] "Stream a reply" → expect markdown renders as it arrives (bold, a list, a link that opens in a new tab with `rel="noopener noreferrer"`), the view stays at the bottom, and a status line with shimmer shows "Writing your reply…" → AC-6
- [ ] Scroll the streaming thread up → expect "Jump to latest"; press it and expect it hides at the bottom → AC-6
- [ ] With a screen reader (or the live region text) → expect the status announced once, then the full reply once, never token by token → AC-6
- [ ] Run progress bar → expect "2 of 12 questions", a progressbar with `aria-valuenow` 2 and max 12, and Pause works; the Luna style bar reads "17 of 48 questions" → AC-10
- [ ] OS reduced motion on → expect the shimmer and progress bar do not animate and content still appears → AC-14
- [ ] A 200 character URL in a message wraps and the page has no horizontal scroll at 360px → AC-5

## Commands

- [ ] `pnpm test` → expect all unit tests pass, including `format-answer`, `validate`, `progress-label`, `composer-rules`, and `announce` → AC-6, AC-7, AC-8, AC-9
- [ ] `pnpm lint && pnpm typecheck && pnpm format:check && pnpm check:colors` → expect all clean, and "No raw colors." → AC-1
- [ ] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → expect every Playwright test passes, including `e2e/chat.spec.ts` and the axe scans in light and dark at 360 and 1280 → AC-3, AC-15

## Value sourcing (one step per row)

- [ ] Answered bubble text → change an option label in the fixture and expect the bubble shows the new label; a stale value shows raw → AC-9
- [ ] Answered bubble Edit → flip `editable` to false and expect no Edit control → AC-9
- [ ] Question progress → pass an area and expect "Area x of y"; omit it and expect only "Question n of m" → AC-8
- [ ] Money formatting → expect `en-NG` whole naira ("₦250,000"), with no decimals → AC-8
- [ ] Composer counter and limit → expect it follows `text.length` and `maxLength` (default 4,000) → AC-7
- [ ] Composer Enter behavior → expect it follows `(pointer: coarse)` and `isComposing` → AC-7
- [ ] Thread live region → expect it follows `streaming` turning false and `status` changing → AC-6
- [ ] Run progress bar → change `done` and `total` and expect the text and `aria-valuenow` follow → AC-10

## Acceptance-criteria coverage

- AC-6 … covered by the stream, jump, live region and markdown steps · AC-7 … composer steps · AC-8 … card steps and the 44px step · AC-9 … Edit, bubble, and locked steps · AC-10 … run progress bar steps · AC-14 (milestone 3 parts) … reduced motion step · AC-5 (overflow) … long URL step · AC-15 … the e2e command. AC-1 to AC-5, AC-11 to AC-13 are covered by their own milestones.
