# Review, feat/privacy-terms, 2026-11-28

**Reviewed by**: Sonnet 5.5 (author on Claude, same family; fresh context)
**Scope**: 61 files, branch vs main
**Verdict**: Approve with nits

## Summary
Adds static privacy and terms pages from typed content, composer and sign up notices, a recorded `policy_acceptance` per account, an updated terms card, and a rate limited "Download my data" export for guests and accounts. The code follows the project rules closely: pure content and config, deps injected into the export rules, typed results, ids only in logs, cascade plus a link rule for the new table, one batched owner scoped read. No blockers or majors. The findings below are small: the card's consent wording versus what it records, a few avoidable DB round trips, and the production build gate.

## Minor
### 🟡 The terms card says it accepts both policies but records only terms, `src/app/terms/actions.ts:30`
**Problem**: The card reads "Please read the new Terms and Privacy notice. By continuing to use BeamX you accept them." The action records only a `terms` row. If `privacyVersion` is bumped alone, `termsOutdated` never fires, so no card appears and no privacy acceptance is stored. If the card ever shows after a failed sign up record, the account ends with a terms row and no privacy row.
**Why it matters**: The acceptance table is meant as proof of what each account accepted. Text and record disagree, and a privacy-only change has no way to ask again.
**Suggested fix**: Record both current versions on OK, and make the card trigger on either policy being behind (or reword the card to terms only and say privacy changes are not re-asked).

### 🟡 Production build fails while `LEGAL` holds placeholders, `src/app/privacy/page.tsx:25`, `src/app/terms/page.tsx:390`
**Problem**: `assertLegalReady(env.VERCEL_ENV)` throws during prerender. Spec AC-9 asked only for a unit test. Consequence: the day this merges to a branch that deploys to Vercel production, every production build goes red, including unrelated hotfixes, until company, address and privacy email are filled.
**Why it matters**: It is a safe failure (last good deploy stays up) and it matches the intent that policies must not ship unnamed, so the stricter behaviour is defensible. But it is a surprise coupling to release flow, and the unit test in the spec only runs when `VERCEL_ENV=production` is set for the test run, which CI will not do.
**Suggested fix**: Keep the gate, but fill `LEGAL` before merging to main (or say in the PR that production deploys are blocked until then). Also note the follow-up in the PR so it is not discovered by a red deploy.

### 🟡 Extra session and DB reads on every home and chat load, `src/app/page.tsx:58`, `src/app/terms/notice.tsx:16`
**Problem**: Home now runs `sessionUser` twice (ChipSeed and TermsSeed). Within TermsSeed the session read and then `policies.newestVersion` run one after the other, for every signed in account on every load, forever, to answer a question that is true for almost nobody after the first OK. On `/c/[id]` it is parallelised, so only home pays the sequential cost.
**Why it matters**: Frankfurt is far from Nigeria and the rules ask for few DB calls per request. The card is a suspense seeded extra, so it costs latency only on the card, not the shell, but it still adds load.
**Suggested fix**: Share one session read per request (React `cache` around the session call) and consider holding the "accepted version" somewhere cheap to read (for example a field on the already loaded credit summary query, or a short lived cookie after OK).

### 🟡 No size guard on the export response, `src/app/api/account/export/route.ts:71`
**Problem**: The whole export (all messages and report content) is read, stringified and returned as one non streamed body. Vercel functions cap a non streamed response at about 4.5 MB.
**Why it matters**: A heavy account will eventually get a platform 413 instead of its data, which is a data access right. The client maps any non 401/429 failure to "We couldn't prepare your data. Try again.", which would be misleading.
**Suggested fix**: Stream the JSON body (or write chunks per section), or at least detect size and return a typed "too large, email us" error. Low urgency for launch volumes.

### 🟡 Email footer links point at production regardless of deploy, `src/email/footer-copy.ts:9`
**Problem**: `base` is always `https://app.beamxsolutions.com`. Before that domain serves the app, every email footer link is dead, and dev or preview emails send readers to production pages that may have different versions.
**Why it matters**: Small. Matches the author's flagged choice and keeps links stable in forwarded mail. Judged acceptable, but the pages must be live on that domain before the first real email goes out.
**Suggested fix**: Keep, and add the domain going live to the launch checklist. Optionally use `NEXT_PUBLIC_APP_URL` outside production.

## Nits
- ⚪ `src/auth/export-data.ts:468`, the limit is per UTC clock hour, so a user can take up to 6 exports across an hour boundary. Fine for abuse control; the spec's "at most 3 an hour" is slightly loose.
- ⚪ `src/components/legal/terms-update-card.tsx:57`, the OK click hides the card before the action resolves and swallows a failure. Documented in the comment, but a failed record also logs nothing server side beyond the thrown action.
- ⚪ `src/auth/policy-acceptance.ts:550`, local type named `Record` shadows the global TS `Record` utility inside this module. Rename (`RecordFn`).
- ⚪ `src/auth/auth.ts:76`, the two create hooks run in `Promise.all`; fine since each swallows its own errors, but a short comment saying so would stop a later edit from breaking sign up.

## Strengths
- Consent record is correct where it matters: create only, never on update, idempotent insert on the unique index, failure logged and never blocks sign up, with the card as the safety net.
- Export is owner scoped on every statement, one atomic `db.batch` round trip, a pure shaping step (guest email nulled, naira conversion, Paystack reference left out), a limit that gives the slot back on a failed read, and logs ids and counts only.
- New table is wired into cascade delete and `linkGuest` (with a conflict safe move), schema, migration and snapshot agree, and the policy pages stay static with prices and retention read from live config so text cannot drift.
- Client side download code returns friendly messages for 401, 429 and network failure.

## Test coverage
Good for a change of this size: unit tests for the legal config and content (AC-2, AC-3, AC-9), `termsOutdated`, acceptance hook, export rules, export shape, route, download helper, terms action and notice, and email footers; integration tests for policies, export (owner only, completeness) and sign up, plus a Playwright spec for pages, links, card and downloads. Gaps: the integration tests were not run locally (CI runs them); the AC-9 production placeholder test only runs when `VERCEL_ENV=production` is set; nothing covers a privacy only version bump (see the first minor); no test of the response size limit.
