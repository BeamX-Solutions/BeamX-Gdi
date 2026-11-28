import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const policyKind = pgEnum("policy_kind", ["terms", "privacy"]);

/**
 * Which version of each policy an account accepted, and when (spec 0017, AC-5, AC-6).
 * One row per account, policy and version; a guest never has rows.
 */
export const policyAcceptance = pgTable(
  "policy_acceptance",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    policy: policyKind("policy").notNull(),
    version: text("version").notNull(),
    acceptedAt: ts("accepted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("policy_acceptance_version_idx").on(
      t.userId,
      t.policy,
      t.version,
    ),
    index("policy_acceptance_user_idx").on(t.userId, t.policy, t.acceptedAt),
  ],
);
