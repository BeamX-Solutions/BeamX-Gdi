# 0003. Design system and UI foundation: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

The BeamX Workspace is a free lead funnel: a business owner chats with an assistant that runs one of four BeamX tools, answers questions as tap cards, reads a report beside the chat, and is nudged to book a consultation. Most clients are Nigerian SME owners, many on mid range Android phones around 360px wide, often on slow or costly mobile data. The UI has to feel trustworthy enough that someone hands over business numbers and then books a call, and light enough to load and stay responsive on those phones.

Spec 0001 fixed the base (Tailwind v4 and shadcn/ui on Radix) but left the BeamX look open. BeamX has a logo (a PNG with royal blue, sky blue, orange, and near black ink) but no brand guide or design file, and the standalone tools are not yet a reference here. Every later feature (the Stellar thread, the other three tools, follow up chat, history, PDF, booking, the landing page) renders inside the same shell and reuses the same cards and report parts, so whatever is decided here is copied many times. Deciding late means each feature invents its own spacing, colors, and states, and a later cleanup touches every screen.

The screens carry some hard UI problems that are cheap to get wrong: a composer that stays above the on screen keyboard, a chat that streams text without fighting the reader's scroll, a report that sits beside the chat on desktop but cannot on a phone, a 60 question Luna run that must not feel endless, and verdict colors (green, amber, red) that must stay meaningful and readable for color blind clients. The project's rules also require expected failures to become friendly cards, never a blank screen.

The scope's bar for done is a `design.md` covering type, color, spacing, and the chat components, plus base components that work on mobile and with a keyboard. Nothing proves the second half unless it is tested.

## Options considered

### Option 1: shadcn/ui and AI Elements, restyled with BeamX tokens, on a dev only `/design` page

Keep the stack spec 0001 chose. Express the BeamX look as shadcn CSS variables; take the chat specific parts (conversation scroll, message, streaming markdown, prompt input, shimmer) from AI Elements, Vercel's shadcn style registry made for AI SDK chat; hand build what is specific to BeamX (answer cards, report parts, error card, shell). Show and test it all on a `/design` route with Playwright and axe.

**Pros**:
- No new UI framework; components are copied into the repo and fully ours.
- AI Elements already solves stick to bottom scrolling, streaming markdown, and the input box, and is built for the `useChat` hook feature #7 will use.
- One route doubles as living documentation and the test target, with no second build tool.

**Cons**:
- AI Elements files are copies; registry fixes must be pulled in by hand.
- A dev only route needs an env flag and must stay out of Production.

### Option 2: hand build every component on shadcn primitives

Same tokens and `/design` page, but write the thread, message, streaming markdown, and composer ourselves.

**Pros**:
- Total control, and no code we don't use.
- No dependency on how AI Elements evolves.

**Cons**:
- Rebuilding scroll anchoring during streaming, partial markdown rendering, and input handling is days of fiddly work that a maintained registry already did, and a likely source of mobile bugs.

### Option 3: a full chat UI library (assistant-ui)

Use a mature chat UI library with its own runtime and themed components.

**Pros**:
- Rich, polished chat features out of the box.

**Cons**:
- Brings its own state runtime that overlaps with the AI SDK's `useChat`, so two models of the conversation must be kept in step.
- Its look and structure are harder to bend to tap cards and a side report panel.

### Option 4: Storybook as the component workshop

Same components, documented and tested in Storybook instead of a `/design` route.

**Pros**:
- The standard tool for isolated component states, with an accessibility addon.

**Cons**:
- A second build pipeline to keep working with Next 16, Tailwind v4, and Cache Components, for a team of a few people.
- Components are tested outside the real app shell and fonts, so layout bugs can hide.

## Rationale

Option 1 wins because it reuses everything spec 0001 already chose and buys the hardest parts instead of building them. The risky UI in this product is streaming chat on small phones; AI Elements targets exactly the AI SDK hooks this project uses, and copying it into the repo keeps control with the team. What is genuinely BeamX (tap cards, report parts, verdict handling, the split view) is small enough to build by hand on Radix primitives, which give keyboard and screen reader behavior for free. A `/design` route instead of Storybook keeps one build, tests components in the real shell with the real fonts and themes, and gives `/check verify` and Playwright one place to look.

The look follows from the audience and the business goal. A calm, trusted advisor feel (neutral surfaces, the logo's royal blue as the one strong color, generous space) keeps attention on the conversation and the report and reads as a serious consultant, which is what turns a free report into a booked call. The first draft proposed indigo; once the logo arrived, the palette moved to the logo's own royal blue (9.7:1 on white). The logo's orange is too close to an amber warning and too light for text (2.8:1), so it stays decorative and the caution verdict moved to yellow. The sky blue is too light for small text on white (3.7:1) but works for focus rings and progress, and a lighter shade of it is the dark theme's main color. Only a PNG logo exists, so the dark theme puts it on a small white badge instead of inventing a recolored version of BeamX's mark. Inter reads well at small sizes on low density Android screens. (Updated 2026-11-21: all text now uses Montserrat, see the two updates below.) Medium radius with 44px targets suits thumbs without wasting space at 360px. Light and dark themes are set up now because shadcn tokens make it nearly free at the start and costly to retrofit.

Several smaller calls were made here, each with its runner up. Charts are plain HTML and CSS bars rather than Recharts, because the reports need bars and a score, not interactive charts, and every kilobyte matters on mobile data (runner up: shadcn charts, if a radar view is later wanted). Theme switching uses `next-themes`, the standard shadcn pairing that avoids a flash of the wrong theme (runner up: a hand rolled cookie script). The `/design` gate is an env flag, not `NODE_ENV`, because the CI e2e job must run it against a production build (runner up: gating on Vercel's environment name, which does not exist in CI). The live region announces finished replies, not each token, because token by token announcements are unusable with a screen reader. The split view starts at 1024px because below that the chat column would shrink under a comfortable reading width once a 360px panel sits beside it. Answered cards collapse into reply bubbles with an Edit link, so long runs stay readable and mistakes stay fixable until scoring freezes the run (spec 0002). On touch screens Enter adds a line and only the Send button sends, because that is what phone keyboards lead people to expect, and a stray send of half an answer is worse than one extra tap (runner up: Enter sends everywhere, as some messaging apps do). The shell renders one layout tree chosen by a screen size check instead of hiding a desktop and a phone tree with CSS, because two hidden trees double every focus target and every axe finding. The shadcn sidebar was left out: it brings its own cookie, shortcut, and mobile drawer, which is more than a placeholder history list needs (runner up: adopt it in feature #14 if history grows into real navigation).

A cross check by a second model before acceptance found that, with Cache Components, the `/design` flag is read at build time, so CI must set it when building; it also tightened the card behavior, the token list, and the touch target rule. Those fixes are folded into `index.md`.

## Update: Montserrat headings (2026-11-21)

**Context.** Montserrat is the BeamX brand font, and the first version of this spec did not know that, so the whole app shipped in Inter. You asked to bring the brand font in.

**Options considered.**
- **Montserrat for headings only, Inter for reading text** (chosen). Headings, card questions, the report title and score carry the brand; chat replies, buttons, labels, and reports' body text stay in Inter.
- **Montserrat everywhere.** The strongest brand match, but Montserrat is wide and geometric: long text takes more room per line, and 14px labels and chat replies read less easily on cheaper Android screens at 360px, which is most of the audience.
- **Montserrat for headings and body, Inter only for small text.** Two fonts mixed inside running text look uneven, and the line between them is hard to keep.

**Rationale.** The original reason for Inter (it stays readable at small sizes on low density screens) still holds for what people read at length, and the brand shows most in big titles. Splitting by role (headings versus reading text) keeps one clear rule, 16px or larger in weight 600 gets Montserrat, that every later component can follow without a judgement call. One weight keeps the extra download small (one variable font file per subset, preloaded by `next/font`).

**Tradeoffs.** A second font adds one font download on first visit. Montserrat headings are wider, so a long tool name or report title wraps sooner; the existing 360px checks catch any overflow.


## Update: Montserrat for all text, and a wider chat column (2026-11-21, later the same day)

**Context.** After seeing the headings only version on a Vercel preview, you asked for Montserrat everywhere, and for the conversation to use more of the screen, like Claude's chat. This reverses the morning's split (Montserrat headings over Inter text).

**Options considered (font).**
- **Montserrat for all text, one variable font, Inter removed** (chosen). One font file covers weights 400 to 600, so the download is no bigger than the two font setup it replaces.
- **Keep Montserrat for headings only.** Better small text legibility on low density screens, but you want one consistent brand look.
- **Montserrat first with Inter loaded as a fallback.** Extra download with no visible gain.

**Options considered (width).**
- **64rem chat column** (chosen). Clearly wider on desktop while long replies stay around 100 characters a line.
- **56rem.** A smaller step, closer to a classic reading width.
- **No cap.** Uses every pixel, but long replies become very long lines on wide monitors, which slows reading.

**Rationale.** Brand consistency is the owner's call, and the risk that drove the original Inter choice (small text at 360px on cheaper Android screens) is checked by the existing 360px and axe gates, not assumed away. The width change only affects screens 1024px and up; phones already use the full width.

**Tradeoffs.** Montserrat is wider, so chips, labels and the composer hint wrap a little sooner, and small 12 to 14px text is slightly less crisp on low density screens. The wider column puts more empty space inside bubbles on very wide screens, since your own messages stay capped at 85% of the column.
