import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { payment } from "../schema";

/**
 * Payments (spec 0004, AC-13). A row is created `pending` at checkout; it moves to
 * `succeeded` (with its credits granted in the same statement), `failed`, or
 * `abandoned`. Every move is a compare and set on `status`, so the webhook, the callback
 * and the sweep can race freely: whichever comes first grants, the rest change nothing.
 */

export type PaymentRow = typeof payment.$inferSelect;

/** A new `pending` payment for a pack. The id is also the Paystack reference. */
export const create = async (
  userId: string,
  pack: {
    readonly id: string;
    readonly credits: number;
    readonly amountKobo: number;
  },
): Promise<PaymentRow> => {
  const [row] = await db
    .insert(payment)
    .values({
      id: newId(),
      userId,
      packId: pack.id,
      credits: pack.credits,
      amountKobo: pack.amountKobo,
      currency: "NGN",
    })
    .returning();
  if (!row) throw new Error("payment insert returned no row");
  return row;
};

/** Server only (webhook, sweep): the payment by its reference, whoever owns it. */
export const byId = async (id: string): Promise<PaymentRow | null> => {
  const [row] = await db.select().from(payment).where(eq(payment.id, id));
  return row ?? null;
};

/** The user's own payment, or null (also for another user's reference). */
export const forUser = async (
  userId: string,
  id: string,
): Promise<PaymentRow | null> => {
  const [row] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.id, id), eq(payment.userId, userId)));
  return row ?? null;
};

export type Succeeded = {
  /** False when the payment was already succeeded, or did not match: nothing moved. */
  readonly granted: boolean;
  readonly userId: string | null;
  readonly credits: number;
  readonly balance: number | null;
};

/**
 * Marks a payment `succeeded` and grants its credits, once (AC-13), in one statement:
 * the payment update (only from `pending`, `abandoned` or `failed`, and only when
 * Paystack's amount and currency equal ours) feeds the account upsert, which feeds the
 * `purchase` ledger entry (key `purchase:<paymentId>`, `balance_after` from the updated
 * balance). A crash can never leave a succeeded payment without its grant. The account
 * normally exists already (the checkout opens it); the upsert only guards a missing one.
 * A payment whose user was deleted is marked succeeded and grants nothing.
 */
export const markSucceeded = async (
  id: string,
  paid: {
    readonly transactionId: string;
    readonly paidAt: string | null;
    readonly amountKobo: number;
    readonly currency: string;
  },
): Promise<Succeeded> => {
  const result = await db.execute(sql`
    WITH p AS (
      UPDATE payment
      SET status = 'succeeded', paystack_transaction_id = ${paid.transactionId},
          paid_at = COALESCE(${paid.paidAt}::timestamptz, now()), updated_at = now()
      WHERE id = ${id}::uuid AND status IN ('pending', 'abandoned', 'failed')
        AND amount_kobo = ${paid.amountKobo}::int AND currency = ${paid.currency}
      RETURNING id, user_id, credits
    ), a AS (
      INSERT INTO credit_account (user_id, balance, last_activity_at)
      SELECT p.user_id, p.credits, now() FROM p WHERE p.user_id IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE
      SET balance = credit_account.balance + excluded.balance,
          last_activity_at = now(), updated_at = now()
      RETURNING user_id, balance
    ), l AS (
      INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, payment_id, idempotency_key)
      SELECT ${newId()}::uuid, a.user_id, 'purchase', p.credits, a.balance, p.id, 'purchase:' || p.id
      FROM p JOIN a ON a.user_id = p.user_id
      RETURNING id
    )
    SELECT p.user_id, p.credits, a.balance, (SELECT count(*) FROM l)::int AS entries
    FROM p LEFT JOIN a ON a.user_id = p.user_id
  `);
  const row = result.rows[0] as
    | {
        user_id: string | null;
        credits: number;
        balance: number | null;
        entries: number;
      }
    | undefined;
  return row
    ? {
        granted: Number(row.entries) > 0,
        userId: row.user_id,
        credits: Number(row.credits),
        balance: row.balance === null ? null : Number(row.balance),
      }
    : { granted: false, userId: null, credits: 0, balance: null };
};

/** Paystack says the payment failed: `pending` (or `abandoned`) to `failed`. */
export const markFailed = async (id: string): Promise<boolean> => {
  const rows = await db
    .update(payment)
    .set({ status: "failed" })
    .where(
      and(
        eq(payment.id, id),
        sql`${payment.status} IN ('pending', 'abandoned')`,
      ),
    )
    .returning({ id: payment.id });
  return rows.length > 0;
};

/**
 * Payments still `pending` more than `olderThanMinutes` after checkout, oldest first, for
 * the daily sweep to check with Paystack (AC-13).
 */
export const listStalePending = async (
  olderThanMinutes: number,
  limit: number,
): Promise<readonly PaymentRow[]> =>
  db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.status, "pending"),
        sql`${payment.createdAt} < now() - make_interval(mins => ${olderThanMinutes}::int)`,
      ),
    )
    .orderBy(payment.createdAt)
    .limit(limit);

/** Marks one payment `abandoned` if it is still `pending` and older than `hours`. */
export const markAbandoned = async (
  id: string,
  hours: number,
): Promise<boolean> => {
  const rows = await db
    .update(payment)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(payment.id, id),
        eq(payment.status, "pending"),
        sql`${payment.createdAt} < now() - make_interval(hours => ${hours}::int)`,
      ),
    )
    .returning({ id: payment.id });
  return rows.length > 0;
};
