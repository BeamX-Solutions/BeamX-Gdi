# 0017. Privacy, terms and consent

**Date**: 2026-11-28
**Status**: In Progress

## Summary

Before any public link, BeamX gets a plain English privacy notice and terms of use, linked everywhere a client acts. Clients agree to them by chatting (guests) and by creating an account (accounts, recorded with the version they accepted). Any client can download everything BeamX holds about them as one JSON file, and delete their account and all its data (already built in spec 0009). The app tracks no one today, so there is no cookie banner: the notice says what the browser stores and why, and a consent banner comes with the first analytics tool, never before.

> Written with the engineer's picks (2026-11-28): instant JSON export, policies naming the company details the engineer supplies, domain `app.beamxsolutions.com`. The policy text is a draft for a lawyer's review before launch, not legal advice.

## Requirements

**User stories**:

- As a business owner, I want to know what BeamX does with my business data before I share it.
- As a business owner, I want a copy of everything BeamX holds about me, and to remove it all.
- As BeamX, we want proof of which terms each account accepted, so a later change can ask again.

**Acceptance criteria**:

- **AC-1**: `/privacy` and `/terms` are static pages (prerendered, no session read) in the workspace's look, with a "Last updated" date and a version string. Their text lives in `src/legal/` as typed content, one source for the pages and the version.
- **AC-2**: The privacy notice covers, in plain words: who BeamX is and how to reach it (`LEGAL.company`, `LEGAL.address`, `LEGAL.privacyEmail`); what is collected (chat messages, tool answers, reports, the business profile, account email and name, credit and payment records, consultation bookings, IP for abuse limits); why (to run the tools and write reports, billing, abuse protection, consultations); who processes it (Anthropic for AI, Neon in Frankfurt for storage, Vercel for hosting, Upstash for limits, Resend for email, Paystack for payments, Calendly for bookings), including that AI processing happens outside Nigeria; how long it is kept (guest data deleted after 30 days without use, account data until the account is deleted, credits expire after 12 months without use, payment records kept as the law requires); what the browser stores (the sign in session, the bot check, the theme and dismissed prompts; no analytics or advertising cookies; Calendly sets its own cookies once its booking page opens); and the client's rights under Nigeria's Data Protection Act 2023 and the GDPR (access, export, correction through the profile page, deletion, complaint to the NDPC).
- **AC-3**: The terms cover the service, credits (prices from config, non refundable once a report is delivered, a failed run costs nothing), acceptable use, that reports are guidance and not financial, legal or professional advice, AI limitations, account ending, liability limits and governing law (Nigeria).
- **AC-4**: The policies are linked from: the composer's small print ("By chatting you agree to our Terms and Privacy notice"), the sign up step of the auth dialog ("By creating an account you agree to …"), the account menu, the landing page footer (spec 0018), and the footer of every email.
- **AC-5**: Creating an account records one `policy_acceptance` row per policy (`user_id`, `policy` = `terms` | `privacy`, `version`, `accepted_at`), in the same flow that verifies the email. A guest's chatting is covered by the composer notice and records nothing.
- **AC-6**: When `LEGAL.termsVersion` changes, a signed in account whose newest `terms` row is older sees a one time card above the composer ("We've updated our terms") with links and an "OK" that records the new version. It never blocks the chat.
- **AC-7**: `GET /api/account/export` (any session, guest or account; no cache) returns `beamx-data-<YYYY-MM-DD>.json` as an attachment: the user (email, name, created), every conversation with its messages, every run with its answers and report content, the business profile, the credit ledger and holds, payments (amount, status, date; no card data, which BeamX never sees), consultations, and policy acceptances. It is one batched read, owner only, at most 3 an hour per user (`LimitStore`, `429`), and logs ids only.
- **AC-8**: The account menu gains "Download my data" (accounts and guests) beside "Delete account". `/profile` links to both.
- **AC-9**: A unit test fails if any `LEGAL` field still holds a `[PLACEHOLDER]` while `VERCEL_ENV=production`, so the policies can't ship unnamed.

**Non goals**: a cookie banner (until analytics exist); per purpose consent toggles; a data request inbox (the privacy email covers it); translations.

## Decision

**Chosen option**: static policy pages from typed content, consent by notice at chat and recorded acceptance at sign up, an instant JSON export, and no cookie banner while nothing non essential is stored.

## Rationale

See [rationale.md](./rationale.md).

## Feature design

**Data model**: `policy_acceptance` (`id uuid`, `user_id` → user cascade, `policy policy_kind`, `version text`, `accepted_at timestamptz default now()`), unique on (`user_id`, `policy`, `version`). Moved on guest link (a guest never has rows, but the link list must name the table).

**Modules**: `src/legal/` (content, `LEGAL` config, versions; pure), `src/app/privacy/`, `src/app/terms/`, `src/app/api/account/export/route.ts`, `src/db/queries/export.ts` (the batched read), `src/db/queries/policies.ts` (record, newest version), the composer notice and auth dialog line in `src/components`, the email footer in `src/email`.

## Build plan

1. `src/legal/` content and config, the two pages, links in composer, auth dialog, account menu, emails.
2. `policy_acceptance` schema, migration, record at sign up, the updated terms card.
3. The export query and route with its limit, the menu item, tests (unit for the shape, integration for owner only and completeness, Playwright for the download and the links).

## Consequences

- Adding analytics later means adding a consent banner first (spec follow up).
- A terms change needs a version bump, which shows the card to every account once.

## Follow-up

- A lawyer reviews the policy text before launch.
- Fill `LEGAL` with the company's registered name, address and privacy email.
