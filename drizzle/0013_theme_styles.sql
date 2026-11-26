ALTER TABLE "themes" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "occasion_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "recipients" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_key_unique" UNIQUE("key");