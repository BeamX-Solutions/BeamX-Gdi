CREATE TYPE "public"."policy_kind" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TABLE "policy_acceptance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"policy" "policy_kind" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_acceptance" ADD CONSTRAINT "policy_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_acceptance_version_idx" ON "policy_acceptance" USING btree ("user_id","policy","version");--> statement-breakpoint
CREATE INDEX "policy_acceptance_user_idx" ON "policy_acceptance" USING btree ("user_id","policy","accepted_at");