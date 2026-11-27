CREATE TYPE "public"."consultation_status" AS ENUM('offered', 'booked', 'canceled');--> statement-breakpoint
CREATE TABLE "consultation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" "consultation_status" DEFAULT 'offered' NOT NULL,
	"start_time" timestamp with time zone,
	"calendly_event_uri" text,
	"calendly_invitee_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"booked_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "consultation_calendly_invitee_uri_unique" UNIQUE("calendly_invitee_uri")
);
--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_user_idx" ON "consultation" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_one_offer_idx" ON "consultation" USING btree ("conversation_id") WHERE "consultation"."status" = 'offered';