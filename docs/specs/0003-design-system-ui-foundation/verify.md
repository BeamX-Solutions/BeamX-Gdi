# Verify: design system & UI foundation · spec 0003 · updated 2026-11-18

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Milestone 3 (chat thread, composer, answer cards) is covered below; the other milestones add their steps when they land. Run against a production build with `ENABLE_DESIGN_PAGE=true` and `SKIP_ENV_VALIDATION=1` set at build and start._

## UI / manual

- [x] `/design` at 360px → "Live conversation": Tab to the first chip, press ArrowRight, then Enter. Expect the card collapses into a bubble "Food and drinks", focus is in the composer, and arrows alone never submitted → AC-8, AC-9
- [x] Press Edit on that bubble → expect the card reopens with "Food and drinks" selected and focused → AC-9
- [x] "What does this mean?" on the card → expect the help text appears; press again and it hides → AC-8
- [x] Multi choice card ("How do customers find you today?") → expect hint "Pick 2 to 4", Confirm disabled until 2 picks, the fifth box blocked after 4, bubble lists labels in option order → AC-8
- [x] Scale card (5 points) → tap 4, expect bubble "4 of 5". Scale card (0 to 10) → expect two rows, no empty grey cell → AC-8
- [x] Money card → submit empty and expect an error under the field; type 250000, leave the field and expect "250,000"; press Enter and expect bubble "₦250,000" → AC-8
- [x] Number card → type 0, Submit, expect "Enter 1 or more." → AC-8
- [x] "Answered bubble, locked" → answer it and expect no Edit link → AC-9
- [x] Every chip, segment, checkbox row, input, Confirm, Submit, Send and Pause is at least 44 by 44px (the Edit link is exempt) → AC-8
- [x] Composer: with 3,712 characters expect "3,712 / 4,000" at 16px; with 4,001 expect Send disabled; 12 lines grow to 6 lines then scroll → AC-7
- [x] Desktop: Shift+Enter adds a line, Enter sends. Touch device (or `hasTouch` and `isMobile`): Enter adds a line, only Send sends. During IME composition Enter never sends → AC-7
- [x] "Stream a reply" → expect markdown renders as it arrives (bold, a list, a link that opens in a new tab with `rel="noopener noreferrer"`), the view stays at the bottom, and a status line with shimmer shows "Writing your reply…" → AC-6
- [x] Scroll the streaming thread up → expect "Jump to latest"; press it and expect it hides at the bottom → AC-6
- [x] With a screen reader (or the live region text) → expect the status announced once, then the full reply once, never token by token → AC-6
- [x] Run progress bar → expect "2 of 12 questions", a progressbar with `aria-valuenow` 2 and max 12, and Pause works; the Luna style bar reads "17 of 48 questions" → AC-10
- [x] OS reduced motion on → expect the shimmer and progress bar do not animate and content still appears → AC-14
- [x] A 200 character URL in a message wraps and the page has no horizontal scroll at 360px → AC-5

## Commands

- [x] `pnpm test` → expect all unit tests pass, including `format-answer`, `validate`, `progress-label`, `composer-rules`, and `announce` → AC-6, AC-7, AC-8, AC-9
- [x] `pnpm lint && pnpm typecheck && pnpm format:check && pnpm check:colors` → expect all clean, and "No raw colors." → AC-1
- [x] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → expect every Playwright test passes, including `e2e/chat.spec.ts` and the axe scans in light and dark at 360 and 1280 → AC-3, AC-15

## Value sourcing (one step per row)

- [ ] Answered bubble text → change an option label in the fixture and expect the bubble shows the new label; a stale value shows raw → AC-9
- [ ] Answered bubble Edit → flip `editable` to false and expect no Edit control → AC-9
- [ ] Question progress → pass an area and expect "Area x of y"; omit it and expect only "Question n of m" → AC-8
- [x] Money formatting → expect `en-NG` whole naira ("₦250,000"), with no decimals → AC-8
- [x] Composer counter and limit → expect it follows `text.length` and `maxLength` (default 4,000) → AC-7
- [x] Composer Enter behavior → expect it follows `(pointer: coarse)` and `isComposing` → AC-7
- [x] Thread live region → expect it follows `streaming` turning false and `status` changing → AC-6
- [ ] Run progress bar → change `done` and `total` and expect the text and `aria-valuenow` follow → AC-10

## Acceptance-criteria coverage

- AC-6 … covered by the stream, jump, live region and markdown steps · AC-7 … composer steps · AC-8 … card steps and the 44px step · AC-9 … Edit, bubble, and locked steps · AC-10 … run progress bar steps · AC-14 (milestone 3 parts) … reduced motion step · AC-5 (overflow) … long URL step · AC-15 … the e2e command. AC-1 to AC-5, AC-11 to AC-13 are covered by their own milestones.

## Milestone 4: report parts, errors, theme, shell, and the full pass

_Added 2026-11-18. Also covers AC-1 to AC-5, AC-11 to AC-14 as a whole._

### UI / manual

- [x] Open `/design`, pick Dark in the header menu, reload → no flash, `html` keeps the `dark` class; device Light/Dark followed by default → AC-2
- [x] At 1280px open `/design/shell`, focus the resize handle, press Left and Right → panel never under 360px or over 60%; rail collapses below 1280px when the panel opens → AC-4
- [x] At 360px open `/design/shell`, tap "View report", press Escape → sheet closes, focus is on the card, no horizontal scroll → AC-5
- [x] On a real Android phone, focus the composer → it stays above the keyboard and the safe area → AC-5
- [ ] In the live conversation on `/design`: stream a reply and use a screen reader → full reply heard once, status text heard when it changes → AC-6
- [x] Composer: type 3,601 characters → counter "3,601 / 4,000" at 16px; 4,001 → Send disabled; desktop Enter sends, Shift+Enter adds a line; touch Enter adds a line → AC-7
- [x] Tab into each of the four card kinds and answer by keyboard → single and scale are one Tab stop, multi needs `min` picks, text validates on submit → AC-8
- [x] Answer a card, then press Edit → bubble shows the label, card reopens with the old answer focused, composer focused after answering, no Edit when locked → AC-9
- [x] Check the run progress bar → tool name, "n of N questions", Pause, hidden with no run → AC-10
- [x] On `/design` "Report parts and error cards": each verdict badge has icon plus label; each bar shows "n/max"; the streaming section is `aria-busy`; the skeleton shows Done, In progress, Waiting → AC-11
- [x] Press Retry on the failed report in the panel → skeleton shows; "Sign up to keep going" links to `/sign-up`; "Got it" dismisses the spend cap card; no failure leaves a blank area → AC-12
- [x] Build with `ENABLE_DESIGN_PAGE` unset and open `/design` → 404 → AC-13
- [x] Turn on reduced motion in the OS and open the sheet, drawer, and a shimmer → nothing animates, content still shows → AC-14

### Commands

- [x] `pnpm test` → all Vitest tests pass, including the `DESIGN.md` and `globals.css` token check → AC-1
- [x] `pnpm check:colors` → "No raw colors." → AC-1
- [x] `SKIP_ENV_VALIDATION=1 ENABLE_DESIGN_PAGE=true pnpm build && pnpm e2e` → axe zero violations at 360 and 1280px in both themes, keyboard, live region, reduced motion, and overflow checks pass → AC-3, AC-15
- [x] CI run on a PR → the e2e job runs and uploads its HTML report (not a required check, see AC-15) → AC-15

### Acceptance-criteria coverage

- AC-1 covered by `pnpm test`, `pnpm check:colors` · AC-2 by the theme steps · AC-3 by the axe run · AC-4 by the resize step · AC-5 by the sheet, phone, and overflow steps · AC-6 by the live region step · AC-7 by the composer step · AC-8 by the card walk · AC-9 by the Edit step · AC-10 by the progress bar step · AC-11 by the report parts step · AC-12 by the error card step · AC-13 by the flag off step · AC-14 by the reduced motion step · AC-15 by the e2e commands

