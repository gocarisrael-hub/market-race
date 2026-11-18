ALTER TABLE "game_states" ADD COLUMN "backup_stops" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN "wrong_answers" integer DEFAULT 0 NOT NULL;