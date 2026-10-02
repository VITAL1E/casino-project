CREATE TABLE "challenge_progress" (
	"user_id" uuid NOT NULL,
	"challenge_id" text NOT NULL,
	"period" text NOT NULL,
	"progress" numeric(14, 2) DEFAULT '0' NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wagered" numeric(16, 2) DEFAULT '0' NOT NULL,
	"bets" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"biggest_win" numeric(16, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_claims" (
	"user_id" uuid NOT NULL,
	"level" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_progress" ADD CONSTRAINT "challenge_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_claims" ADD CONSTRAINT "vip_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_progress_key" ON "challenge_progress" USING btree ("user_id","challenge_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "vip_claims_key" ON "vip_claims" USING btree ("user_id","level");