# 0004. Credits and billing: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

> ⚠️ Premise note: this feature assumes two decisions that have no spec yet. (1) The tool module contract (feature #5) carries a `creditPrice` and the assistant (feature #6) exposes approval gated `startRun` / `resumeRun` tools. (2) Accounts (feature #8) provide sign up with a verified email, which buying credits, the sign up grant, and the Luna claim all need. The spec states both as constraints. Milestones 1 and 2 can ship in Slice 1; milestones 3 and 4 have to wait for #8.

The workspace was scoped as a free lead funnel, but Luna already sells plans for about ₦50,000 through its own credit system. A free workspace that runs Luna would undercut it, and every tool run and chat reply costs real AI money. On 2026-11-19 BeamX decided that the workspace works like an AI platform with tools: one credit balance per client, a price per tool run, and paid chat beyond a free allowance. Booking a consultation stays the main outcome; credit sales sit beside it.

The forces are mostly about money and trust. A client must never be charged by surprise or for a report that failed, and a charge or a grant must never happen twice, even when webhooks are retried, streams are replayed, or two tabs race. Reports can fail and retry up to 3 times (spec 0002), and Luna writes its plan in five phases that resume after a failure, so "when to charge" is not the same moment as "when the client said yes". Guests run tools before they have an account, so free credits invite farming through throwaway guests. Clients are mostly in Nigeria and pay in naira; BeamX already uses Paystack.

The stack constrains the shape. Neon is reached over `neon-http`, which has no interactive transactions: a multi step write is one `db.batch` (one transaction, but each statement sees its own snapshot), and concurrency must be settled in SQL, not in app code (spec 0002). Spec 0001 asks for pure functions at the core and effects at the edges, typed results instead of thrown errors, and few, parallel DB calls per request because Frankfurt is far from Lagos. Schema changes must be additive only.

Compliance is in play: payment records and personal data fall under Nigeria's data protection law (NDPA) and GDPR for clients abroad, and money movements need an audit trail. Card data must stay out of the app (PCI DSS). Not deciding this blocks every tool run feature from feature #7 onward and any public link.

## Options considered

### Option 1: A balance number, deducted at run start

One `balance` column per user. Approving a run deducts the price immediately; a failed report adds it back with a refund write.

**Pros**:
- Fewest tables and the simplest code; one conditional `UPDATE` does the check and the deduct.
- Easy to reason about for a small team.

**Cons**:
- No history: the client can't see where credits went, and a dispute has nothing to look at.
- "Refund on failure" is a second write that can be lost on a crash, leaving the client charged for a failed report.
- The client sees credits leave before receiving anything, which is the opposite of the promise in the scope.

### Option 2: Append only ledger plus a balance row, holds in their own table (chosen)

A `credit_account` row keeps `balance` and `held`; every balance change also writes one `credit_ledger` entry in the same batch, with a unique idempotency key. Approving a run creates a `credit_hold` and raises `held`; the report turning ready charges the hold in the same commit; failure, abandonment, or idleness releases it.

**Pros**:
- Matches the promise exactly: nothing is taken until the report exists, and a failure releases with no refund write.
- Full, explainable history for the client and staff; the daily drift check proves the balance against the ledger.
- Idempotency keys make every money write safe to repeat; the balance row keeps "enough credits?" a single fast row check.

**Cons**:
- Two numbers to keep in step (`balance` and `held`), plus the ledger; any code path that skips the provided statement builders breaks the invariants.
- More tables and more tests than option 1.
- Needs a raising SQL guard (`billing_assert`) to make "start run plus hold" all or nothing over `neon-http`.

### Option 3: Per purchase lots, oldest first (Luna's model)

Each purchase or grant is a lot with its own remaining amount and expiry date; spending draws from the lots that expire soonest.

**Pros**:
- Per purchase expiry and exact provenance of every credit spent.
- Already proven in Luna, so its data maps over directly.

**Cons**:
- A charge splits across several lots, so every spend is several writes; much harder to make race safe without interactive transactions.
- Per purchase expiry was not wanted: the agreed rule is whole balance expiry after 12 months of inactivity.
- More complex history and refunds (returning credits to the right lot).

## Rationale

Option 2 is the only one that keeps the central promise, "charged only when the report arrives, a failed run costs nothing", without relying on a compensating refund write. Holding instead of deducting turns failure into a release of a reservation, so a crash between steps can only leave credits reserved (and the idle sweep frees them), never taken. Charging inside the same batch as `reports.markReady`, and guarding it on that attempt actually winning, ties payment to the existence of the report, which is the thing the client pays for. Reports already retry up to 3 times and Luna resumes phases, so a reservation that survives retries is the natural fit.

The ledger is chosen for trust and operations rather than cleverness. The forces here are money and disputes: a client asking "where did my 150 credits go?" needs an answer, and the team needs a way to detect bugs before clients do. The balance row is kept alongside (a stored derived value, normally discouraged) because the hot path, "can this client afford this run?", must be one guarded row update that settles the race in SQL, as spec 0002 requires; the daily drift check is what makes storing it safe. Option 1 was rejected for its lost refund failure mode and missing history; option 3 for its multi write spends under `neon-http` and for an expiry rule BeamX did not want.

The supporting choices follow the same forces. The hosted Paystack redirect keeps card data out of the app and adds no third party script. A plain typed `fetch` wrapper covers the two endpoints needed without a loosely typed community SDK. Vercel Cron reuses what the guest purge job already needs. The free chat counter lives in Redis because it is disposable, per day state. Metered chat with a ceiling protects margins on heavy context messages (reports, later files) while still giving the client a firm upper bound; the engineer first questioned a flat price, and metering won once it was clear that most messages round to 1 credit at ₦100 per credit anyway.

### Design inputs gathered (summary)

- Credit value ₦100; Luna balances move at ×10 (Luna: 1 credit = ₦1,000, 50 per plan, 100 for ₦100,000).
- Hold at run start, released after 30 idle days, kept through report retries, confirm again on resume.
- Chat: messages per Lagos day free (10 accounts, 5 guests), then metered with a 3 credit ceiling; error charges nothing, stop charges the real cost so far.
- Starter: 30 on the first billable action (IP capped for guests), 50 on verified sign up once per email ever.
- Guests cannot buy; fixed packs from typed config; naira only, VAT inclusive.
- Whole balance expiry after 12 months of inactivity; in app warning now, email and enforcement in slice 5.
- Luna import by verified email, freezing Luna credits at cutover.
- Staff adjustments through a guarded script; money refunds by hand in the Paystack dashboard.
- Account deletion: ledger and holds cascade, payments kept unlinked, email hash kept.
