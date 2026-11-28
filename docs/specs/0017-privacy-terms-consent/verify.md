# Verify: privacy, terms & consent · spec 0017 · updated 2026-11-28
_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open `/privacy` and `/terms` signed out → each shows its title, "Last updated … · Version …", and a link to the other policy; the build lists both as static (○) → AC-1
- [ ] Read `/privacy` → it names the company, address and privacy email from `LEGAL`; lists what is collected, why, every processor (Anthropic outside Nigeria, Neon, Vercel, Upstash, Resend, Paystack, Calendly), retention (guest 30 days, credits 12 months), browser storage, and rights including the NDPC → AC-2
- [ ] Read `/terms` → tool prices match each tool's `creditPrice` (Stellar, Beacon, Luna) and ₦ per credit matches `billingConfig`; it covers refunds, failed runs, acceptable use, not advice, AI limits, account ending, liability and Nigerian law → AC-3
- [ ] On `/`, under the composer → "By chatting you agree to our Terms and Privacy notice", both open in a new tab → AC-4
- [ ] Open the auth dialog on Sign up → "By creating an account you agree to our Terms and Privacy notice" above Continue → AC-4
- [ ] As a guest, open More options; as an account, open the Account menu → both list Privacy notice and Terms of use → AC-4
- [ ] Trigger a code email, a report email and a consultation email (dev prints them) → each HTML and plain text version ends with links to `https://app.beamxsolutions.com/privacy` and `/terms` → AC-4
- [ ] Sign up a new account → the DB has two `policy_acceptance` rows (`terms`, `privacy`) with the current `LEGAL` versions; a guest who only chats has none → AC-5
- [ ] With a signed in account, bump `LEGAL.termsVersion`, rebuild, load `/` and a saved chat → "We've updated our terms" card above the composer, chat still usable; tap OK → a new `terms` row with the new version; reload → no card. A guest never sees it → AC-6
- [ ] As a guest after one message, More options → Download my data → `beamx-data-YYYY-MM-DD.json` with the chat and its messages, `user.guest: true`, `email: null` → AC-7, AC-8
- [ ] As an account with a run, a payment and a booking, Download my data → the file has the user, chats, runs with answers and report, profile, ledger and holds, payments in naira (no Paystack reference), consultations and policy acceptances → AC-7
- [ ] Download 4 times in one hour → the 4th shows "You've downloaded your data a few times this hour" (429), no file → AC-7
- [ ] `/profile` as an account → "Your data" has Download my data and Delete account; as a guest with a session → Download only → AC-8

## Commands
- [ ] `curl -i <app>/api/account/export` with no cookie → `401 {"code":"unauthenticated"}`, `Cache-Control: no-store` → AC-7
- [ ] With a session cookie → `200`, `Content-Disposition: attachment; filename="beamx-data-….json"`, `Cache-Control: no-store`; logs show `data_exported` with ids and counts only → AC-7
- [ ] `pnpm vitest run --project unit src/legal src/auth/export-data.test.ts src/db/queries/export-shape.test.ts src/auth/policy-acceptance.test.ts src/email/footer.test.ts` → all pass → AC-2, AC-3, AC-5, AC-7, AC-9
- [ ] `pnpm test:integration` on a throwaway Neon branch → `policies.int.test.ts`, `export.int.test.ts` (owner only, completeness), `link.int.test.ts` and `sign-up.int.test.ts` pass → AC-5, AC-7
- [ ] `VERCEL_ENV=production pnpm vitest run --project unit src/legal` while `LEGAL` holds `[PLACEHOLDER]` → fails; and a production build on Vercel fails in `/privacy` → AC-9
- [ ] `pnpm exec playwright test e2e/legal.spec.ts` → 16 pass (4 projects) → AC-1, AC-4, AC-7, AC-8

## Acceptance-criteria coverage
- AC-1 covered by the policy page step and the Playwright policy pages test
- AC-2 by the privacy reading step and `legal.test.ts`
- AC-3 by the terms reading step and `legal.test.ts`
- AC-4 by the composer, sign up, menu and email steps, `footer.test.ts`, and the Playwright links test (landing page footer waits for spec 0018)
- AC-5 by the sign up step, `policy-acceptance.test.ts` and `sign-up.int.test.ts`
- AC-6 by the version bump step and `legal.test.ts` (`termsOutdated`)
- AC-7 by the download, limit and curl steps, `export-data.test.ts`, `export-shape.test.ts`, `export.int.test.ts`
- AC-8 by the menu and `/profile` steps and the Playwright download tests
- AC-9 by the production placeholder step and `legal.test.ts`
