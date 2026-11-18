ALTER TABLE "uploads" ADD COLUMN "background" text DEFAULT 'keep' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "bg_path" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "cutout_path" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "cut_path" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "cut_failed" boolean DEFAULT false NOT NULL;