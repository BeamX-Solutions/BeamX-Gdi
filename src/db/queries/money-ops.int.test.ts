import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { lunaCreditImport, signupGrantClaim, user } from "../schema";
import * as conversations from "./conversations";
import * as credits from "./credits";
import { deleteAccount, linkGuest } from "./users";
import { guestTracker, unwrap } from "../test/helpers";
import { signupEmailHash } from "@/billing/money-ops";

// Spec 0004, milestone 4: account grants (AC-11), Luna import and claim (AC-16), guest
// link with grants (AC-12), deletion (AC-19), adjust (AC-17), expiry (AC-15), drift
// (AC-20).

const t = guestTracker();
const accounts: string[] = [];
const emails: string[] = [];
const hashes: string[] = [];
afterAll(async () => {
  await Promise.all(accounts.map((id) => deleteAccount(id)));
  await t.cleanup();
  for (const email of emails)
    await db.delete(lunaCreditImport).where(eq(lunaCreditImport.email, email));
  for (const hash of hashes)
    await db
      .delete(signupGrantClaim)
      .where(eq(signupGrantClaim.emailHash, hash));
});

const SECRET = "integration-test-hash-secret-0123456789";
const GRANTS = { starter: 30, signup: 50 } as const;

const freshEmail = () => {
  const email = `acct-${newId()}@test.beamx`;
  emails.push(email);
  hashes.push(signupEmailHash(email, SECRET));
  return email;
};

/** A signed up user: verified email, not a guest. */
const account = async (email = freshEmail(), verified = true) => {
  const id = newId();
  await db.insert(user).values({
    id,
    name: "Ada",
    email,
    emailVerified: verified,
    isAnonymous: false,
  });
  accounts.push(id);
  return id;
};

const claim = (u: string, secret: string | null = SECRET) =>
  credits.claimPendingGrants(u, {
    ...GRANTS,
    hashEmail: (e) => (secret === null ? null : signupEmailHash(e, secret)),
  });

const ledgerKinds = async (u: string) => {
  const r = await db.execute(sql`
    SELECT kind, amount FROM credit_ledger WHERE user_id = ${u}::uuid ORDER BY created_at, id
  `);
  return r.rows.map((x) => {
    const row = x as { kind: string; amount: number };
    return [row.kind, Number(row.amount)] as const;
  });
};

const booksBalance = async (u: string) =>
  (await credits.findDrift()).every((d) => d.userId !== u);

describe("claimPendingGrants (AC-11)", () => {
  it("a direct sign up gets the starter and sign up grants once", async () => {
    const u = await account();
    expect(await claim(u)).toEqual({
      eligible: true,
      starter: 30,
      signup: 50,
      luna: 0,
    });
    expect(await claim(u)).toEqual({
      eligible: true,
      starter: 0,
      signup: 0,
      luna: 0,
    });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 80, held: 0 });
    expect(await ledgerKinds(u)).toEqual([
      ["starter_grant", 30],
      ["signup_grant", 50],
    ]);
    expect(await booksBalance(u)).toBe(true);
  });

  it("an existing account gets only the sign up grant on top", async () => {
    const u = await account();
    await credits.ensureAccount(u, 30);
    expect(await claim(u)).toMatchObject({ starter: 0, signup: 50 });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 80 });
  });

  it("a new email hash for a user who already got the sign up grant adds nothing, books still balance", async () => {
    // A rotated BILLING_HASH_SECRET (or an email change) gives a hash that is new to
    // signup_grant_claim while `signup:<userId>` is already in the ledger.
    const email = freshEmail();
    const u = await account(email);
    expect(await claim(u)).toMatchObject({ signup: 50 });
    const rotated = "rotated-integration-hash-secret-987654";
    hashes.push(signupEmailHash(email, rotated));
    expect(await claim(u, rotated)).toMatchObject({ signup: 0 });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 80 });
    expect(await booksBalance(u)).toBe(true);
  });

  it("the same email signing up again after deletion gets no second sign up grant", async () => {
    const email = freshEmail();
    const first = await account(email);
    expect(await claim(first)).toMatchObject({ signup: 50 });
    expect(await deleteAccount(first)).toBe(true);
    // The claim row has no user link, so it outlives the account.
    const [kept] = await db
      .select()
      .from(signupGrantClaim)
      .where(eq(signupGrantClaim.emailHash, signupEmailHash(email, SECRET)));
    expect(kept).toBeDefined();

    const second = await account(` ${email.toUpperCase()} `);
    expect(await claim(second)).toMatchObject({ starter: 30, signup: 0 });
    expect(await credits.getSummary(second)).toMatchObject({ balance: 30 });
  });

  it("a guest or an unverified email only gets the account, no claim", async () => {
    const g = await t.guest();
    expect(await claim(g)).toEqual({
      eligible: false,
      starter: 30,
      signup: 0,
      luna: 0,
    });
    const unverified = await account(freshEmail(), false);
    expect(await claim(unverified)).toMatchObject({
      eligible: false,
      signup: 0,
    });
  });

  it("with no hash key the sign up grant is skipped, and claimed later once set", async () => {
    const u = await account();
    expect(await claim(u, null)).toMatchObject({ starter: 30, signup: 0 });
    expect(await claim(u)).toMatchObject({ starter: 0, signup: 50 });
  });

  it("two claims racing give the sign up grant once", async () => {
    const u = await account();
    const both = await Promise.all([claim(u), claim(u)]);
    expect(both.map((c) => c.signup).sort()).toEqual([0, 50]);
    expect(await credits.getSummary(u)).toMatchObject({ balance: 80 });
    expect(await booksBalance(u)).toBe(true);
  });
});

describe("Luna import and claim (AC-16)", () => {
  it("imports once, then the verified user with that email claims it once", async () => {
    const email = freshEmail();
    expect(
      await credits.importLunaCredits([{ email, lunaCredits: 7, credits: 70 }]),
    ).toEqual({ imported: 1, skipped: 0 });
    // The same file again changes nothing.
    expect(
      await credits.importLunaCredits([{ email, lunaCredits: 9, credits: 90 }]),
    ).toEqual({ imported: 0, skipped: 1 });

    const u = await account(email);
    await db.execute(sql`
      UPDATE credit_account SET last_activity_at = now() - interval '1 day'
      WHERE user_id = ${u}::uuid
    `);
    expect(await claim(u)).toEqual({
      eligible: true,
      starter: 30,
      signup: 50,
      luna: 70,
    });
    expect(await claim(u)).toMatchObject({ luna: 0 });
    expect(await credits.getSummary(u)).toMatchObject({ balance: 150 });
    expect(await ledgerKinds(u)).toContainEqual(["luna_import", 70]);
    const [row] = await db
      .select()
      .from(lunaCreditImport)
      .where(eq(lunaCreditImport.email, email));
    expect(row?.claimedByUserId).toBe(u);
    expect(row?.claimedAt).not.toBeNull();
    expect(await booksBalance(u)).toBe(true);
  });

  it("a claimed import stays claimed when its user is deleted (AC-19)", async () => {
    const email = freshEmail();
    await credits.importLunaCredits([{ email, lunaCredits: 1, credits: 10 }]);
    const first = await account(email);
    expect(await claim(first)).toMatchObject({ luna: 10 });
    expect(await deleteAccount(first)).toBe(true);

    const [row] = await db
      .select()
      .from(lunaCreditImport)
      .where(eq(lunaCreditImport.email, email));
    expect(row?.claimedByUserId).toBeNull();
    expect(row?.claimedAt).not.toBeNull();
    const second = await account(email);
    expect(await claim(second)).toMatchObject({ luna: 0 });
  });

  it("is never claimed by an unverified user", async () => {
    const email = freshEmail();
    await credits.importLunaCredits([{ email, lunaCredits: 2, credits: 20 }]);
    const u = await account(email, false);
    expect(await claim(u)).toMatchObject({ luna: 0 });
  });
});

describe("guest link after the sign up grant (AC-12)", () => {
  it("the new account keeps its grants, gets the guest's held credits, forfeits the rest", async () => {
    const guest = await t.guest();
    await credits.ensureAccount(guest, 30);
    const run = unwrap(
      await credits.startRunWithHold(
        guest,
        (await conversations.create(guest)).id,
        "stellar",
        "1",
        20,
      ),
    );
    // Better Auth creates the account (hook: claim) before `onLinkAccount` moves the guest.
    const u = await account();
    await claim(u);
    await linkGuest(guest, u);

    expect(await credits.getSummary(u)).toMatchObject({
      balance: 30 + 50 + 20,
      held: 20,
    });
    expect(await credits.activeRunHold(u, run.run.id)).not.toBeNull();
    expect(await ledgerKinds(u)).toContainEqual(["guest_grant_forfeit", -10]);
    expect(await booksBalance(u)).toBe(true);
  });
});

describe("adjust (AC-17)", () => {
  it("writes one adjustment with its reason and actor", async () => {
    const u = await account();
    await credits.ensureAccount(u, 30);
    const after = unwrap(
      await credits.adjust(u, 25, "goodwill after an outage", "staff@beamx.co"),
    );
    expect(after).toMatchObject({ balance: 55, held: 0, available: 55 });
    const r = await db.execute(sql`
      SELECT amount, balance_after, reason, actor FROM credit_ledger
      WHERE user_id = ${u}::uuid AND kind = 'adjustment'
    `);
    expect(r.rows).toEqual([
      {
        amount: 25,
        balance_after: 55,
        reason: "goodwill after an outage",
        actor: "staff@beamx.co",
      },
    ]);
    expect(await booksBalance(u)).toBe(true);
  });

  it("refuses to go below what is held, changing nothing", async () => {
    const u = await account();
    await credits.ensureAccount(u, 30);
    const conv = await conversations.create(u);
    unwrap(await credits.startRunWithHold(u, conv.id, "stellar", "1", 20));
    expect(await credits.adjust(u, -11, "too much", "staff@beamx.co")).toEqual({
      ok: false,
      error: { code: "would_go_below_held", balance: 30, held: 20 },
    });
    expect(
      unwrap(await credits.adjust(u, -10, "ok", "staff@beamx.co")),
    ).toMatchObject({ balance: 20, held: 20, available: 0 });
  });

  it("is user_not_found without a credit account", async () => {
    const u = await account();
    expect(await credits.adjust(u, 5, "x", "staff@beamx.co")).toEqual({
      ok: false,
      error: { code: "user_not_found" },
    });
  });

  it("finds a user by email, any case", async () => {
    const email = freshEmail();
    const u = await account(email);
    expect(await credits.userIdByEmail(email.toUpperCase())).toBe(u);
    expect(await credits.userIdByEmail(freshEmail())).toBeNull();
  });
});

describe("expiry (AC-15)", () => {
  const age = (u: string, interval: string) =>
    db.execute(sql`
      UPDATE credit_account SET last_activity_at = now() - ${interval}::interval
      WHERE user_id = ${u}::uuid
    `);
  const balanceOf = async (u: string) => (await credits.getSummary(u))?.balance;

  it("off: counts what would expire and takes nothing", async () => {
    const u = await account();
    await credits.ensureAccount(u, 30);
    await age(u, "13 months");
    const result = await credits.expireInactive(12, "Africa/Lagos", false);
    expect(result.expired).toBe(0);
    expect(result.due).toBeGreaterThanOrEqual(1);
    expect(await balanceOf(u)).toBe(30);
  });

  it("on: expires a 12 month idle balance once, skipping recent and held accounts", async () => {
    const idle = await account();
    await credits.ensureAccount(idle, 30);
    await age(idle, "12 months 2 days");

    const recent = await account();
    await credits.ensureAccount(recent, 30);
    await age(recent, "11 months");

    const holding = await account();
    await credits.ensureAccount(holding, 30);
    const conv = await conversations.create(holding);
    unwrap(
      await credits.startRunWithHold(holding, conv.id, "stellar", "1", 10),
    );
    await age(holding, "13 months");

    const result = await credits.expireInactive(12, "Africa/Lagos", true);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(await balanceOf(idle)).toBe(0);
    expect(await ledgerKinds(idle)).toEqual([
      ["starter_grant", 30],
      ["expiry", -30],
    ]);
    expect(await balanceOf(recent)).toBe(30);
    expect(await balanceOf(holding)).toBe(30);
    expect(await booksBalance(idle)).toBe(true);

    // A replay expires nothing more.
    await credits.expireInactive(12, "Africa/Lagos", true);
    expect(await ledgerKinds(idle)).toHaveLength(2);
  });
});

describe("findDrift (AC-20)", () => {
  it("reports a user whose ledger does not add up, and only while it fails", async () => {
    const u = await account();
    await credits.ensureAccount(u, 30);
    expect(await booksBalance(u)).toBe(true);

    // Test only: a hand written ledger row breaks the books on purpose.
    await db.execute(sql`
      INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, idempotency_key)
      VALUES (${newId()}::uuid, ${u}::uuid, 'adjustment', 5, 35, ${`test-drift:${u}`})
    `);
    const drift = (await credits.findDrift()).find((d) => d.userId === u);
    expect(drift).toEqual({
      userId: u,
      balance: 30,
      ledgerSum: 35,
      held: 0,
      activeHeld: 0,
    });

    await db.execute(sql`
      DELETE FROM credit_ledger WHERE idempotency_key = ${`test-drift:${u}`}
    `);
    expect(await booksBalance(u)).toBe(true);
  });
});
