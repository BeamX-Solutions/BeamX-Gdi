import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "abandoned",
]);

/**
 * One Paystack checkout (spec 0004, AC-13). The `id` (UUID v7) is also the Paystack
 * `reference`, so the webhook, the callback and the sweep all find the row by its key.
 * `credits` and `amount_kobo` are copied from the pack at checkout, so a later pack edit
 * never changes what this payment grants. Kept with a null `user_id` after the account is
 * deleted (tax records, AC-19). Status changes only through `queries/payments.ts`.
 */
export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    packId: text("pack_id").notNull(),
    credits: integer("credits").notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: paymentStatus("status").notNull().default("pending"),
    paystackTransactionId: text("paystack_transaction_id"),
    paidAt: ts("paid_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    check("payment_credits_positive", sql`${t.credits} > 0`),
    check("payment_amount_positive", sql`${t.amountKobo} > 0`),
    index("payment_pending_idx")
      .on(t.status, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    index("payment_user_idx").on(t.userId),
  ],
);
