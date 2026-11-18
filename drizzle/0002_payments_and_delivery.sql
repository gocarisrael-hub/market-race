ALTER TABLE "orders" ADD COLUMN "answers_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pay_sessions" ADD COLUMN "price_key" text DEFAULT '' NOT NULL;