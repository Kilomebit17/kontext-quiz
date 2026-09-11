CREATE TABLE "challenge_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_started_at" jsonb NOT NULL,
	"answers" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"quiz_id" uuid NOT NULL,
	"host_id" uuid,
	"deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "game_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"quiz_id" uuid,
	"quiz_title" text NOT NULL,
	"host_id" uuid,
	"mode" text NOT NULL,
	"pin" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"player_count" integer NOT NULL,
	"average_correct_percent" real NOT NULL,
	"hardest_question_index" integer,
	"questions" jsonb NOT NULL,
	"players" jsonb NOT NULL,
	CONSTRAINT "game_results_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pin" text NOT NULL,
	"quiz_id" uuid,
	"host_id" uuid,
	"mode" text NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"cover_url" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"google_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_attempts_challenge_idx" ON "challenge_attempts" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenges_host_idx" ON "challenges" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "game_results_host_idx" ON "game_results" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "game_sessions_host_idx" ON "game_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "quizzes_owner_idx" ON "quizzes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "quizzes_visibility_idx" ON "quizzes" USING btree ("visibility");