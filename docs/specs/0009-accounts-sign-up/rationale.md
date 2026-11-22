# 0009. Accounts and sign up to save: rationale

## Context

Guests already chat, run Stellar and get reports with no account: the Better Auth `anonymous` plugin gives each guest a real user row, and `onLinkAccount` already moves every owned table, including credits with spec 0004's merge rules, when a guest becomes an account. What is missing is any way to become an account. Without it, nothing a guest does survives beyond their browser cookie, spec 0004's milestones 3 and 4 (Paystack top ups, the `/credits` page, the sign up grant, the Luna import, the guest merge) cannot start, and spec 0001's promise to delete unclaimed guests after 30 days has no counterpart that lets people claim their data.

Three forces shape the design. First, spec 0004 grants 50 credits once per verified email and imports Luna balances by email, so every account email must be proven, not just typed. Second, the anonymous plugin links the guest only in the request that creates the account's first session, and only in the browser that holds the guest cookie; any verification step that can complete in another browser (a phone's mail app opening a link in its own browser is common) silently leaves the guest behind, and the 30 day purge would then delete their work. Third, the audience is Nigerian small business owners, mostly on phones, many arriving from social apps whose in app browsers Google refuses to sign in from.

The team is small and already runs Better Auth, Neon, Upstash, Vercel and BotID; Resend was chosen for email in spec 0001. Personal data falls under NDPA 2023 and GDPR, so self service deletion and automatic cleanup are part of doing this properly, not extras.

## Options considered

### Option 1: Email and password plus Google, the email account created by a code in the same tab (chosen)

The sign up form collects name, email and password, but the account is created only when the 6 digit code is entered, through the `email-otp` plugin's code sign in (which makes the user already verified and signed in). The password is then attached with the server only `setPassword` inside that session. Password reset also uses codes. Google OAuth links automatically to an existing account with the same email.

**Pros**:

- The code is typed in the tab that holds the guest cookie, so the link always happens; no account exists before the email is proven, so there are no unverified accounts to clean up or hijack.
- Familiar to everyone (password) and one tap for Gmail users (Google).
- All within Better Auth plugins already in the dependency; no new auth vendor.

**Cons**:

- A password means a reset flow, breach checks and more support than passwordless.
- Two methods to test and keep working, plus account linking between them.
- Sign up is three steps and needs a small custom route to set the password, instead of Better Auth's one call sign up.

### Option 2: Email code only (passwordless), plus Google

Sign up and sign in with a 6 digit code every time, no password.

**Pros**:

- Nothing to forget or leak; the least code to maintain; every sign in proves the email.

**Cons**:

- Every sign in waits on an email, which hurts when deliverability is patchy.
- Less familiar to some users, who expect a password. (The engineer preferred passwords.)

### Option 3: Email and password verified by link

Better Auth's default link based verification.

**Pros**:

- The standard pattern, least custom UI.

**Cons**:

- A link opened in another browser signs in there without the guest cookie, so the guest's work is not carried over and is later purged. Spec 0004's grants still work, but the core promise of the feature fails for exactly the mobile users this product serves.

### Option 4: Google only

**Pros**:

- Smallest build; verified email for free.

**Cons**:

- Shuts out people without a Google account or who are inside an in app browser, and puts sign up entirely in one vendor's hands.

## Rationale

Option 1 is the only one that meets all three forces with the engineer's choice of passwords: the code is entered in the guest's tab (the anonymous plugin matches `/sign-in`, so the link happens exactly when the account is created), the account exists only once the email is proven, and Google covers the fast path. Option 2 is simpler and was the first recommendation, but the engineer chose passwords; Option 1 keeps the same safety properties by using codes for verification and reset only. Option 3 is ruled out by the cross browser link failure, and Option 4 by reach.

Smaller calls made in design, each with the runner up:

- **Auth rate limits in Upstash through Better Auth's `customStorage`**, failing open, instead of `secondaryStorage` (which would also move sessions into Redis and make Redis an auth dependency) or the default memory store (per function instance on Vercel, so it barely limits). Runner up: the `database` storage, which costs a Frankfurt round trip per auth call.
- **The purge joins the existing daily cron** through a small `runDailyJobs`, rather than a second cron entry: Vercel Hobby allows few cron jobs, and both are daily sweeps. Runner up: a separate `/api/cron/purge` route.
- **Last activity from existing `updated_at` columns**, no new column: the indexes on `conversation (user_id, updated_at)` and `tool_run (user_id, created_at)` keep it cheap at this scale. Runner up: a `last_active_at` column on `user`, which every write path would have to bump.
- **Hook seam, not the grant**: `onAccountVerified` gives spec 0004 milestone 4 one place to plug in, keeping money work in its own reviewed milestone.
- **Deletion with a fresh session and typed email**, not an email code: strong enough against accidents and session theft on a shared phone, and works for Google users who have no password.
- **The sign up form reveals existing accounts**: clearer for users than a generic message, and the per IP limit bounds enumeration. Reset stays generic, where clarity matters less.

### Why the account is created at the code step (changed after the cross check)

The first draft used Better Auth's `/sign-up/email` with `requireEmailVerification` and verified by code afterwards. Reading Better Auth 1.7.25 showed three problems. With verification required, sign up on an email that already exists returns a generic fake success (no code, new password ignored), so the "account exists" message could not work. Worse, it allowed a pre hijack: anyone could sign up with someone else's email and their own password, and if the real owner later entered the code, the verified account would carry the attacker's password. And an unverified local row blocks Google linking for that email (`requireLocalEmailVerified`). Creating the account only at the code step, then attaching the password inside the proven session, removes all three, and makes the 7 day cleanup of unverified accounts unnecessary.

Other corrections from the same review: Better Auth's rate limit storage takes a single atomic `consume` call, its default rules limit every `/sign-in*` path (including the guest's anonymous sign in, which spec 0008 already guards, so that rule is turned off), `trustedProviders` names only the incoming OAuth provider (`google`), the user update hook gets no previous value (so `onAccountVerified` must be idempotent instead of "once"), deleting a user returns 400 `SESSION_EXPIRED` and skips the freshness rule when given a password (so our route never passes one), and the purge must skip guests with work in flight.
