CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'abandoned');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"pack_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paystack_transaction_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_credits_positive" CHECK ("payment"."credits" > 0),
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount_kobo" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_pending_idx" ON "payment" USING btree ("status","created_at") WHERE "payment"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payment" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE set null ON UPDATE no action;