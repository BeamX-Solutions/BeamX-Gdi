import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
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

export const messageRole = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
]);

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    index("conversation_user_recent_idx").on(
      t.userId,
      t.lastMessageAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey(),
    seq: bigint("seq", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    parts: jsonb("parts").$type<unknown>().notNull(),
    metadata: jsonb("metadata").$type<unknown>(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [index("message_thread_idx").on(t.conversationId, t.seq)],
);
