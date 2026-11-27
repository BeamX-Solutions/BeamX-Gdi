import { sql } from "drizzle-orm";
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
import { conversation } from "./chat";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const consultationStatus = pgEnum("consultation_status", [
  "offered",
  "booked",
  "canceled",
]);

/**
 * A free strategy call offered in a chat (spec 0016). Its id is the `utm_content` the
 * Calendly widget carries, so the signed webhook maps a booking back to the chat.
 */
export const consultation = pgTable(
  "consultation",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    status: consultationStatus("status").notNull().default("offered"),
    startTime: ts("start_time"),
    calendlyEventUri: text("calendly_event_uri"),
    calendlyInviteeUri: text("calendly_invitee_uri").unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    bookedAt: ts("booked_at"),
    canceledAt: ts("canceled_at"),
  },
  (t) => [
    index("consultation_user_idx").on(t.userId),
    // One open offer per chat (AC-2).
    uniqueIndex("consultation_one_offer_idx")
      .on(t.conversationId)
      .where(sql`${t.status} = 'offered'`),
  ],
);
