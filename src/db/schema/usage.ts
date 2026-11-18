import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";
import { conversation } from "./chat";
import { toolRun } from "./runs";

export const aiPurpose = pgEnum("ai_purpose", [
  "chat",
  "report",
  "title",
  "extraction",
]);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    callKey: text("call_key").unique(),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id").references(() => toolRun.id, {
      onDelete: "set null",
    }),
    purpose: aiPurpose("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_usage_created_idx").on(t.createdAt),
    index("ai_usage_user_idx").on(t.userId),
    index("ai_usage_run_idx").on(t.runId),
    index("ai_usage_conversation_idx").on(t.conversationId),
  ],
);
