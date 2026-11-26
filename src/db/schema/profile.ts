import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

/**
 * One business profile per user (spec 0002 reserved it; spec 0012 defines it). `facts`
 * is `Record<key, { value, sourceRunId: uuid | null, updatedAt: ISO string }>`, checked
 * against the fact catalog (`tools/_kit/facts.ts`) on every read and write.
 */
export const businessProfile = pgTable("business_profile", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  facts: jsonb("facts")
    .$type<unknown>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});
