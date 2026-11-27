# 0018. Public landing page and SEO

**Date**: 2026-11-28
**Status**: Proposed

## Summary

A first time visitor at `app.beamxsolutions.com/` sees a fast, server rendered page that explains BeamX in one screen and starts a guest chat with one tap. Anyone who already has a session (guest or account) skips it and lands straight in their chat, as today. The page carries full metadata, social cards, structured data, a sitemap and robots rules, so it can be found and shared.

> Written with the engineer's picks (2026-11-28): the root shows the landing page to new visitors only, on `app.beamxsolutions.com`. The copy is a first draft for the engineer to edit.

## Requirements

**User stories**:

- As a small business owner who found a shared link, I want to understand in seconds what BeamX does for me and try it without signing up.
- As a returning client, I want `/` to open my chat, not a marketing page.
- As BeamX, we want the page to rank and to look right when shared on WhatsApp, X and LinkedIn.

**Acceptance criteria**:

- **AC-1**: `src/proxy.ts` (Next 16 Proxy, matcher `/` only) rewrites `/` to `/welcome` when the request has no Better Auth session cookie (`better-auth.session_token`, or its `__Secure-` form on HTTPS). With the cookie, `/` serves the workspace unchanged. It reads the cookie only (no DB, no session check), the optimistic check the Next guide describes.
- **AC-2**: `/welcome` is fully static (prerendered, no session read) and is also reachable directly. Its canonical URL is `/`.
- **AC-3**: The page, top to bottom: the header (logo, Sign in); a hero with the headline "Understand and grow your business", one supporting line ("Chat with BeamX to check an idea, measure your business health or build a marketing plan, with reports written for Nigerian small businesses."), the main button "Start free" and a note "No sign up needed to start"; a product preview drawn with the real chat and report components on fixture data (a short exchange and a score card); the three tools (Stellar, Beacon, Luna) with one line each and their credit price from `billingConfig`; how it works in three steps (tell us about your business, answer a few questions, get your report and talk to an adviser); the free strategy call; a short privacy line linking to `/privacy`; and a footer with Terms, Privacy, beamxsolutions.com and the year.
- **AC-4**: "Start free" goes to `/new`, a route that renders today's empty workspace (the starter prompts), so a visitor without a session reaches the chat; their first message creates the guest session and the `/c/<id>` chat exactly as today. Sign in opens the existing auth dialog on `/new`.
- **AC-5**: Metadata: `metadataBase` from `NEXT_PUBLIC_APP_URL`; title "BeamX: grow your business with an AI adviser"; a description under 160 characters; Open Graph and Twitter `summary_large_image` cards with a 1200 by 630 image made by `opengraph-image.tsx` (logo, headline, brand colors, Montserrat); `lang="en"`; theme color.
- **AC-6**: `robots.ts` allows `/`, `/welcome`, `/privacy`, `/terms` and disallows `/c/`, `/new`, `/api/`, `/credits`, `/profile`, `/design`; `sitemap.ts` lists `/`, `/privacy` and `/terms`. Chats, credits and profile pages send `noindex`.
- **AC-7**: JSON-LD on the landing page: `Organization` (BeamX Solutions, logo, `sameAs` beamxsolutions.com) and `SoftwareApplication` (business category, offers free to start).
- **AC-8**: It meets the design system (DESIGN.md tokens only, Montserrat, both themes, 360 and 1280 widths with no horizontal scroll), passes axe in both themes, and scores at least 90 for performance, accessibility, best practices and SEO in a Lighthouse run on the preview. Images are the logo and the generated card only; no client JavaScript beyond the theme toggle and the auth dialog.
- **AC-9**: Playwright: a fresh visitor at `/` sees the landing page, Start free opens the chat, sending a message creates a chat, and a later visit to `/` opens the workspace; the metadata, `robots.txt` and `sitemap.xml` answer as specified.

**Non goals**: a blog or content pages; translations; paid ads tracking (it would need spec 0017's consent banner first); A/B tests.

## Decision

**Chosen option**: a static landing page served at `/` by a cookie only Proxy rewrite for visitors without a session, with the chat reachable at `/new`.

## Rationale

See [rationale.md](./rationale.md).

## Feature design

**Routes**: `src/app/welcome/page.tsx` (static), `src/app/new/page.tsx` (the current `/` workspace page), `src/app/page.tsx` unchanged for sessions, `src/proxy.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.tsx`. Landing sections live in `src/components/landing/` from props and fixtures, with a `/design` showcase.

**Domain**: `NEXT_PUBLIC_APP_URL=https://app.beamxsolutions.com` on Production once the DNS record points to Vercel; Preview keeps the per deploy URL.

## Build plan

1. Proxy, `/new`, `/welcome` skeleton, the routing Playwright check.
2. The landing sections with real copy and the product preview, `/design`, axe.
3. Metadata, Open Graph image, JSON-LD, robots, sitemap, noindex on private pages; Lighthouse on the preview.

## Consequences

- `/` serves two pages depending on a cookie, so caches must vary on it; the rewrite happens before caching, and the landing page itself never reads the session.
- A guest whose session expired sees the landing page again, which is the right first screen for them.

## Follow-up

- Point `app.beamxsolutions.com` at Vercel and set `NEXT_PUBLIC_APP_URL` on Production.
- Link the app from beamxsolutions.com.
