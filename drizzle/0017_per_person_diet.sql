DROP INDEX "redemptions_order_stop";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "restriction_counts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_order_stop_tasting" ON "redemptions" USING btree ("order_id","stop_index","tasting_id");--> statement-breakpoint
-- Existing orders: a ticked allergen or diet is the whole group's, as before.
UPDATE "orders" SET "restriction_counts" = (
  SELECT COALESCE(jsonb_object_agg(k, "orders"."people"), '{}'::jsonb)
  FROM unnest("orders"."allergens" || "orders"."diets") AS k
) WHERE cardinality("allergens") + cardinality("diets") > 0;
