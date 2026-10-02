CREATE TABLE "classic_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game" text NOT NULL,
	"bet" numeric(14, 2) NOT NULL,
	"state" jsonb NOT NULL,
	"proof" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fair_seeds" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"server_seed" text NOT NULL,
	"server_seed_hash" text NOT NULL,
	"client_seed" text NOT NULL,
	"nonce" integer DEFAULT 0 NOT NULL,
	"previous" jsonb
);
--> statement-breakpoint
ALTER TABLE "classic_rounds" ADD CONSTRAINT "classic_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fair_seeds" ADD CONSTRAINT "fair_seeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classic_rounds_user_idx" ON "classic_rounds" USING btree ("user_id","status");