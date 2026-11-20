CREATE TYPE "public"."credit_entry_kind" AS ENUM('starter_grant', 'signup_grant', 'purchase', 'run_charge', 'chat_charge', 'expiry', 'adjustment', 'luna_import', 'guest_grant_forfeit');--> statement-breakpoint
CREATE TYPE "public"."hold_purpose" AS ENUM('run', 'chat');--> statement-breakpoint
CREATE TYPE "public"."hold_release_reason" AS ENUM('report_failed', 'abandoned', 'idle', 'chat_error');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('active', 'charged', 'released');--> statement-breakpoint
CREATE TABLE "credit_account" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"held" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expiry_warned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_account_balance_nonnegative" CHECK ("credit_account"."balance" >= 0),
	CONSTRAINT "credit_account_held_range" CHECK ("credit_account"."held" >= 0 AND "credit_account"."held" <= "credit_account"."balance")
);
--> statement-breakpoint
CREATE TABLE "credit_hold" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "hold_purpose" NOT NULL,
	"run_id" uuid,
	"message_id" uuid,
	"amount" integer NOT NULL,
	"status" "hold_status" DEFAULT 'active' NOT NULL,
	"release_reason" "hold_release_reason",
	"charged_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "credit_hold_amount_positive" CHECK ("credit_hold"."amount" > 0),
	CONSTRAINT "credit_hold_charged_range" CHECK ("credit_hold"."charged_amount" IS NULL OR "credit_hold"."charged_amount" BETWEEN 1 AND "credit_hold"."amount"),
	CONSTRAINT "credit_hold_run_target" CHECK ("credit_hold"."purpose" <> 'run' OR "credit_hold"."run_id" IS NOT NULL OR "credit_hold"."status" <> 'active'),
	CONSTRAINT "credit_hold_chat_target" CHECK (("credit_hold"."purpose" = 'chat') = ("credit_hold"."message_id" IS NOT NULL)),
	CONSTRAINT "credit_hold_settled" CHECK (("credit_hold"."status" = 'active') = ("credit_hold"."settled_at" IS NULL)
        AND ("credit_hold"."status" = 'released') = ("credit_hold"."release_reason" IS NOT NULL)
        AND ("credit_hold"."status" = 'charged') = ("credit_hold"."charged_amount" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "credit_entry_kind" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"hold_id" uuid,
	"run_id" uuid,
	"payment_id" uuid,
	"reason" text,
	"actor" text DEFAULT 'system' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_ledger_amount_nonzero" CHECK ("credit_ledger"."amount" <> 0),
	CONSTRAINT "credit_ledger_balance_after_nonnegative" CHECK ("credit_ledger"."balance_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_account" ADD CONSTRAINT "credit_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_run_id_tool_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tool_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_hold_id_credit_hold_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."credit_hold"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_run_id_tool_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tool_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_hold_one_active_per_run" ON "credit_hold" USING btree ("run_id") WHERE "credit_hold"."status" = 'active' AND "credit_hold"."purpose" = 'run';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_hold_one_per_message" ON "credit_hold" USING btree ("message_id") WHERE "credit_hold"."purpose" = 'chat';--> statement-breakpoint
CREATE INDEX "credit_hold_active_idx" ON "credit_hold" USING btree ("status","purpose") WHERE "credit_hold"."status" = 'active';--> statement-breakpoint
CREATE INDEX "credit_hold_user_idx" ON "credit_hold" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_created_idx" ON "credit_ledger" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);