import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../id";
import { user } from "./auth";
import { conversation } from "./chat";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const runStatus = pgEnum("run_status", [
  "in_progress",
  "paused",
  "completed",
  "abandoned",
]);
export const answerSource = pgEnum("answer_source", [
  "client",
  "profile",
  "chat",
  "file",
]);
export const reportStatus = pgEnum("report_status", [
  "pending",
  "generating",
  "ready",
  "failed",
  // Some phases saved, the next call continues (spec 0013).
  "partial",
]);

export const toolRun = pgTable(
  "tool_run",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    toolId: text("tool_id").notNull(),
    toolVersion: text("tool_version").notNull(),
    status: runStatus("status").notNull().default("in_progress"),
    scores: jsonb("scores").$type<unknown>(),
    basedOnRunId: uuid("based_on_run_id").references(
      (): AnyPgColumn => toolRun.id,
      { onDelete: "set null" },
    ),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    index("tool_run_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("tool_run_conversation_idx").on(t.conversationId),
    index("tool_run_based_on_idx").on(t.basedOnRunId),
    uniqueIndex("tool_run_one_active_per_conversation")
      .on(t.conversationId)
      .where(sql`${t.status} = 'in_progress'`),
    check(
      "tool_run_completed_has_scores",
      sql`(${t.status} = 'completed') = (${t.scores} IS NOT NULL AND ${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const toolRunAnswer = pgTable(
  "tool_run_answer",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    runId: uuid("run_id")
      .notNull()
      .references(() => toolRun.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: answerSource("source").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [unique("tool_run_answer_run_question").on(t.runId, t.questionId)],
);

export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    runId: uuid("run_id")
      .notNull()
      .references(() => toolRun.id, { onDelete: "cascade" }),
    status: reportStatus("status").notNull().default("pending"),
    content: jsonb("content").$type<unknown>(),
    error: jsonb("error").$type<unknown>(),
    model: text("model"),
    attempts: integer("attempts").notNull().default(0),
    generatedAt: ts("generated_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    unique("report_run_unique").on(t.runId),
    check(
      "report_ready_has_content",
      sql`${t.status} <> 'ready' OR ${t.content} IS NOT NULL`,
    ),
    check("report_attempts_range", sql`${t.attempts} BETWEEN 0 AND 3`),
  ],
);
