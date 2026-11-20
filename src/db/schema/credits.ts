import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";
import { toolRun } from "./runs";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

/** Spec 0004. Balance changes only through the statement shapes in `queries/credits.ts`. */

export const creditEntryKind = pgEnum("credit_entry_kind", [
  "starter_grant",
  "signup_grant",
  "purchase",
  "run_charge",
  "chat_charge",
  "expiry",
  "adjustment",
  "luna_import",
  "guest_grant_forfeit",
]);
export const holdPurpose = pgEnum("hold_purpose", ["run", "chat"]);
export const holdStatus = pgEnum("hold_status", [
  "active",
  "charged",
  "released",
]);
export const holdReleaseReason = pgEnum("hold_release_reason", [
  "report_failed",
  "abandoned",
  "idle",
  "chat_error",
]);

export const creditAccount = pgTable(
  "credit_account",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    held: integer("held").notNull().default(0),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    expiryWarnedAt: ts("expiry_warned_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    check("credit_account_balance_nonnegative", sql`${t.balance} >= 0`),
    check(
      "credit_account_held_range",
      sql`${t.held} >= 0 AND ${t.held} <= ${t.balance}`,
    ),
  ],
);

export const creditHold = pgTable(
  "credit_hold",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: holdPurpose("purpose").notNull(),
    // CASCADE, not SET NULL: a user delete cascades through tool_run and credit_hold, and a
    // SET NULL on an active hold would trip credit_hold_run_target and abort the delete.
    runId: uuid("run_id").references(() => toolRun.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id"),
    amount: integer("amount").notNull(),
    status: holdStatus("status").notNull().default("active"),
    releaseReason: holdReleaseReason("release_reason"),
    chargedAmount: integer("charged_amount"),
    createdAt: ts("created_at").notNull().defaultNow(),
    settledAt: ts("settled_at"),
  },
  (t) => [
    check("credit_hold_amount_positive", sql`${t.amount} > 0`),
    check(
      "credit_hold_charged_range",
      sql`${t.chargedAmount} IS NULL OR ${t.chargedAmount} BETWEEN 1 AND ${t.amount}`,
    ),
    check(
      "credit_hold_run_target",
      sql`${t.purpose} <> 'run' OR ${t.runId} IS NOT NULL OR ${t.status} <> 'active'`,
    ),
    check(
      "credit_hold_chat_target",
      sql`(${t.purpose} = 'chat') = (${t.messageId} IS NOT NULL)`,
    ),
    check(
      "credit_hold_settled",
      sql`(${t.status} = 'active') = (${t.settledAt} IS NULL)
        AND (${t.status} = 'released') = (${t.releaseReason} IS NOT NULL)
        AND (${t.status} = 'charged') = (${t.chargedAmount} IS NOT NULL)`,
    ),
    uniqueIndex("credit_hold_one_active_per_run")
      .on(t.runId)
      .where(sql`${t.status} = 'active' AND ${t.purpose} = 'run'`),
    uniqueIndex("credit_hold_one_per_message")
      .on(t.messageId)
      .where(sql`${t.purpose} = 'chat'`),
    index("credit_hold_active_idx")
      .on(t.status, t.purpose)
      .where(sql`${t.status} = 'active'`),
    index("credit_hold_user_idx").on(t.userId),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: creditEntryKind("kind").notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    holdId: uuid("hold_id").references(() => creditHold.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id").references(() => toolRun.id, {
      onDelete: "set null",
    }),
    /** FK to `payment.id` is added with the payment table (spec 0004, milestone 3). */
    paymentId: uuid("payment_id"),
    reason: text("reason"),
    actor: text("actor").notNull().default("system"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("credit_ledger_amount_nonzero", sql`${t.amount} <> 0`),
    check(
      "credit_ledger_balance_after_nonnegative",
      sql`${t.balanceAfter} >= 0`,
    ),
    index("credit_ledger_user_created_idx").on(
      t.userId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);
