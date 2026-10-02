CREATE TABLE "stakes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stakes" ADD CONSTRAINT "stakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stakes_status_idx" ON "stakes" USING btree ("status");