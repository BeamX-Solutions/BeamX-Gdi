# Auth

## Overview

Better Auth server and client config, with tables in Neon via the Drizzle adapter. Guests start without signing up: the `anonymous` plugin gives each guest a real user row, and signing up keeps their work (feature #8). `auth.ts` (server config), `link.ts` (the guest link hook), and `client.ts` (the React auth client with the anonymous plugin) exist, served by `src/app/api/auth/[...all]/route.ts`. Email sign up, sign in, password reset by code and delete account are built (spec 0009); the UI lives in `src/components/auth/`.

## Conventions

- Use the Better Auth `anonymous` plugin for guests. On sign up, `onLinkAccount` moves the guest's runs to the new account.
- `onLinkAccount` calls `users.linkGuest` (one batch over every user owned table) and must let any error propagate, no try and log: Better Auth then aborts before deleting the guest, so a failed link keeps the guest and their data.
- Secrets and URLs come from `src/lib/env.ts`: `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` as `baseURL`. `baseURL` falls back to `VERCEL_URL` on previews, and `trustedOrigins` adds `VERCEL_BRANCH_URL`, so the branch preview link can sign a guest in.
- User data stays in our DB, so NDPA/GDPR export and delete stay possible.
- `POST /api/auth/sign-in/anonymous` is BotID checked first (`isBot()` from `src/lib/bot-check.ts`), so a bot can't mint guests; a bot gets `403 {"code":"bot"}`.
- Then `guest-limit.ts` caps new guests per IP a Lagos day (`LIMIT_GUESTS_PER_IP`, spec 0008): over the cap gets `429 {"code":"guest_limit"}`. Only a `200` sign in counts, with no IP the cap is skipped, and a Redis error allows.
- A guest is signed in on the first send, never on page load: the resume route answers `204`, not `401`, with no session, because the chat client's `401` handling signs a guest in.
- The guest session cookie is strictly necessary (no consent needed); tracking cookies wait for feature #18.
- Accounts are created only by the email code sign in (`emailOTP`, `/sign-in/email-otp`), so every email is verified; the password is set right after through `/api/account/set-password`, which runs the breach check itself. `/sign-up/email` answers `404` in the route: never re enable it.
- `/delete-user` answers `404` too: only `/api/account/delete` deletes (BotID, `typedEmailMatches`, and Better Auth's one day `freshAge`, answering `SESSION_EXPIRED` for an older session).
- The BotID protected auth paths live once in `paths.ts`; the route's `isBot()` check and BotID's `protect` list in `src/instrumentation-client.ts` both read it. A path on only one side blocks every real user or lets bots through.
- The auth POSTs are rate limited by Better Auth's `rateLimit` with the Upstash storage and rules in `rate-limit.ts` (shared by every function instance, fails open); the email check also limits per email under a sha256 key. The guest sign in keeps spec 0008's daily cap instead.
- `account-verified.ts` (`afterUserWrite`, from the user create and update database hooks) is the hook seam for a verified, non guest user. It calls `claimGrants` (`grants.ts`, spec 0004: starter, sign up and Luna grants), is idempotent, and never throws (a failure logs `grant_claim_failed`).
- On sign up from a guest, Better Auth creates the account (the hook grants 30 + 50) before `onLinkAccount` runs, so the guest link takes the "target already has credits" path: held credits move, spare free credits are forfeited.

## Gotchas

- Anonymous users never linked to an account are purged after 30 days by a daily Vercel Cron job (protected by `CRON_SECRET`). Anything that hangs off a user must cascade on that delete.
- Auth tables use plain random uuid ids (`advanced.database.generateId: "uuid"`). A custom `generateId` (our UUID v7 `newId`) made the CLI emit `text` ids, so the spec 0002 fallback applies. `src/db/schema/auth.ts` is generated: regenerate with `pnpm dlx auth@latest generate --config src/auth/auth.ts --output src/db/schema/auth.ts -y` (set `SKIP_ENV_VALIDATION=1`), never hand edit.
- The Better Auth Drizzle adapter works with Drizzle 0.45.4 (typechecks with `better-auth` 1.7.25).
- `stale-session.ts` is a `hooks.before` that drops a revoked or expired session cookie from sign in requests. Without it the anonymous plugin's after hook expires the new session cookie in the same response, so sign in answers `200` but leaves the browser signed out. Its path list mirrors the plugin's matcher in better-auth 1.7.25: check it again when you upgrade.

## Agent skills

- [better-auth-best-practices](../../.claude/skills/better-auth-best-practices/): `better-auth/skills`, server and client config, adapters, plugins
- [create-auth](../../.claude/skills/create-auth/): `better-auth/skills`, scaffolding auth routes and UI
- [better-auth-security-best-practices](../../.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, CSRF, trusted origins
- [email-and-password-best-practices](../../.claude/skills/email-and-password-best-practices/): `better-auth/skills`, email verification, password reset

Declined: Better Auth docs MCP

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md)
- [0002 Data model](../../docs/specs/0002-data-model/index.md)
- [0009 Accounts and sign up to save](../../docs/specs/0009-accounts-sign-up/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
