CREATE TYPE "public"."message_role" AS ENUM('system', 'user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."answer_source" AS ENUM('client', 'profile', 'chat', 'file');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('in_progress', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('chat', 'report', 'title', 'extraction');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_anonymous" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "message_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"error" jsonb,
	"model" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_run_unique" UNIQUE("run_id"),
	CONSTRAINT "report_ready_has_content" CHECK ("report"."status" <> 'ready' OR "report"."content" IS NOT NULL),
	CONSTRAINT "report_attempts_range" CHECK ("report"."attempts" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "tool_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"tool_id" text NOT NULL,
	"tool_version" text NOT NULL,
	"status" "run_status" DEFAULT 'in_progress' NOT NULL,
	"scores" jsonb,
	"based_on_run_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_run_completed_has_scores" CHECK (("tool_run"."status" = 'completed') = ("tool_run"."scores" IS NOT NULL AND "tool_run"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tool_run_answer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" "answer_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_run_answer_run_question" UNIQUE("run_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"call_key" text,
	"user_id" uuid,
	"conversation_id" uuid,
	"run_id" uuid,
	"purpose" "ai_purpose" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_call_key_unique" UNIQUE("call_key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_run_id_tool_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tool_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_run" ADD CONSTRAINT "tool_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_run" ADD CONSTRAINT "tool_run_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_run" ADD CONSTRAINT "tool_run_based_on_run_id_tool_run_id_fk" FOREIGN KEY ("based_on_run_id") REFERENCES "public"."tool_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_run_answer" ADD CONSTRAINT "tool_run_answer_run_id_tool_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tool_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_run_id_tool_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tool_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "conversation_user_recent_idx" ON "conversation" USING btree ("user_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "tool_run_user_created_idx" ON "tool_run" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tool_run_conversation_idx" ON "tool_run" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "tool_run_based_on_idx" ON "tool_run" USING btree ("based_on_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_run_one_active_per_conversation" ON "tool_run" USING btree ("conversation_id") WHERE "tool_run"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_run_idx" ON "ai_usage" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_usage_conversation_idx" ON "ai_usage" USING btree ("conversation_id");