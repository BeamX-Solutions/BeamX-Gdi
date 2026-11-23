CREATE TABLE "luna_credit_import" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"luna_credits" integer NOT NULL,
	"credits" integer NOT NULL,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "luna_credit_import_email_unique" UNIQUE("email"),
	CONSTRAINT "luna_credit_import_luna_positive" CHECK ("luna_credit_import"."luna_credits" > 0),
	CONSTRAINT "luna_credit_import_credits_positive" CHECK ("luna_credit_import"."credits" > 0),
	CONSTRAINT "luna_credit_import_claim_time" CHECK ("luna_credit_import"."claimed_by_user_id" IS NULL OR "luna_credit_import"."claimed_at" IS NOT NULL),
	CONSTRAINT "luna_credit_import_email_normalized" CHECK ("luna_credit_import"."email" = lower(btrim("luna_credit_import"."email")))
);
--> statement-breakpoint
CREATE TABLE "signup_grant_claim" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "luna_credit_import" ADD CONSTRAINT "luna_credit_import_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;