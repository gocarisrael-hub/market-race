ALTER TABLE "occasions" ADD COLUMN "recipients" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "players_feminine" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recipient" text;--> statement-breakpoint
UPDATE "occasions" SET "recipients" = COALESCE((SELECT jsonb_object_agg(CASE WHEN f = 'group' AND "occasions"."decor" = 'family' THEN 'family' ELSE f END, "occasions"."question_set_id") FROM unnest("occasions"."forms") AS f WHERE f <> 'company'), '{}'::jsonb) WHERE "audience" = 'private';--> statement-breakpoint
UPDATE "occasions" SET "players_feminine" = true WHERE "audience" = 'private' AND "forms" = ARRAY['she']::text[];--> statement-breakpoint
UPDATE "orders" SET "recipient" = CASE WHEN "form" = 'group' AND EXISTS (SELECT 1 FROM "occasions" o WHERE o."key" = "orders"."occasion_key" AND o."decor" = 'family') THEN 'family' ELSE "form" END WHERE "form" <> 'company';
