# Legal

## Overview

The privacy notice and terms of use as typed content, plus the `LEGAL` config (company details, policy versions) that the pages, the sign up record, the updated terms card and the email footers all read (spec 0017). Pure: no DB, no env, no I/O.

## Key files

| Path         | Owns                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`  | `LEGAL` (company, address, privacy email, each policy's version and "last updated"), `currentAcceptances()`, `policiesOutdated()`, `assertLegalReady()`, `appHostOf()`, the paths |
| `content.ts` | `privacyNotice(facts)` and `termsOfUse(facts)`: the policy words as sections and blocks                                                                                           |

## Conventions

- Live values the policies quote (tool prices, naira per credit, free chat limits, guest purge days, credit expiry) come in as arguments. The route pages read them from the tool modules, `billingConfig` and `users.PURGE`, so this folder never imports the DB or billing.
- Bump `termsVersion` / `privacyVersion` (and the matching `…Updated` date) whenever a policy's words change in substance. A new version of either shows every account the updated terms card once, and its OK records both current versions (`currentAcceptances()`, the same list sign up records).
- A change to a live value the terms quote (a tool price, a pack price) changes the terms text too. Decide whether it needs a version bump.
- `[PLACEHOLDER]` marks a value still to supply. `/privacy` and `/terms` call `assertLegalReady(env.VERCEL_ENV)`, so a production build fails while any `LEGAL` field holds one; `legal.test.ts` also fails under `VERCEL_ENV=production`.
- The policy text is a plain English draft for a lawyer's review, not legal advice. `LEGAL.company` is the brand name from beamxsolutions.com until the registered name is confirmed.
- The app's address is never hardcoded: the policy pages pass `appHostOf(env.NEXT_PUBLIC_APP_URL)` into the content, and the email footers link to `NEXT_PUBLIC_APP_URL` (`src/email/footer-copy.ts`). A custom domain needs only that env var. beamxsolutions.com is the company site, not this app's address.

## Commands

```bash
pnpm vitest run --project unit src/legal   # content, versions, placeholder guard
```

## Related specs

- [0017 Privacy, terms and consent](../../docs/specs/0017-privacy-terms-consent/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
