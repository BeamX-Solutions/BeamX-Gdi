# Auth

## Overview

Better Auth server and client config, with tables in Neon via the Drizzle adapter. Guests start without signing up: the `anonymous` plugin gives each guest a real user row, and signing up keeps their work (feature #8). `auth.ts` (server config) and `link.ts` (the guest link hook) exist; there is no `/api/auth` route, sign up method, or UI yet (features #7 and #8).

## Conventions

- Use the Better Auth `anonymous` plugin for guests. On sign up, `onLinkAccount` moves the guest's runs to the new account.
- `onLinkAccount` calls `users.linkGuest` (one batch over every user owned table) and must let any error propagate, no try and log: Better Auth then aborts before deleting the guest, so a failed link keeps the guest and their data.
- Secrets and URLs come from `src/lib/env.ts`: `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` as `baseURL`. `trustedOrigins` also allows the `VERCEL_URL` of preview deploys.
- User data stays in our DB, so NDPA/GDPR export and delete stay possible.
- The guest session cookie is strictly necessary (no consent needed); tracking cookies wait for feature #18.

## Gotchas

- Anonymous users never linked to an account are purged after 30 days by a daily Vercel Cron job (protected by `CRON_SECRET`). Anything that hangs off a user must cascade on that delete.
- Auth tables use plain random uuid ids (`advanced.database.generateId: "uuid"`). A custom `generateId` (our UUID v7 `newId`) made the CLI emit `text` ids, so the spec 0002 fallback applies. `src/db/schema/auth.ts` is generated: regenerate with `pnpm dlx auth@latest generate --config src/auth/auth.ts --output src/db/schema/auth.ts -y` (set `SKIP_ENV_VALIDATION=1`), never hand edit.
- The Better Auth Drizzle adapter works with Drizzle 0.45.4 (typechecks with `better-auth` 1.7.25).

## Agent skills

- [better-auth-best-practices](../../.claude/skills/better-auth-best-practices/): `better-auth/skills`, server and client config, adapters, plugins
- [create-auth](../../.claude/skills/create-auth/): `better-auth/skills`, scaffolding auth routes and UI
- [better-auth-security-best-practices](../../.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, CSRF, trusted origins
- [email-and-password-best-practices](../../.claude/skills/email-and-password-best-practices/): `better-auth/skills`, email verification, password reset

Declined: Better Auth docs MCP

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md)
- [0002 Data model](../../docs/specs/0002-data-model/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
