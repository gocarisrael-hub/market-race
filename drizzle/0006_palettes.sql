CREATE TABLE "palettes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"palette" jsonb NOT NULL,
	"theme_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "decor" text DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "palette_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_palette_id_palettes_id_fk" FOREIGN KEY ("palette_id") REFERENCES "public"."palettes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "occasions" SET "decor" = CASE WHEN "audience" = 'company' THEN 'company' WHEN "key" LIKE '%birthday%' THEN 'birthday' WHEN "key" IN ('couple', 'bachelorette', 'bachelor', 'anniversary', 'love') THEN 'love' WHEN "key" LIKE '%family%' THEN 'family' WHEN "key" LIKE '%friend%' OR "key" LIKE '%group%' OR "key" LIKE '%unit%' THEN 'friends' ELSE 'generic' END;
