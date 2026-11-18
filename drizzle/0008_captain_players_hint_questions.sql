ALTER TABLE "game_states" ADD COLUMN "players" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hint_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;