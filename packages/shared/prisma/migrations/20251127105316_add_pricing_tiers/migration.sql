BEGIN;

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_model_id_priority_key" ON "pricing_tiers"("model_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_model_id_name_key" ON "pricing_tiers"("model_id", "name");

-- AddForeignKey
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "prices" ADD COLUMN "pricing_tier_id" TEXT;

-- Data Migration: Create default pricing tiers with DETERMINISTIC IDs
-- Pattern: {model_id}_tier_default
INSERT INTO "pricing_tiers" (id, model_id, name, is_default, priority, conditions)
SELECT
  model_id || '_tier_default',
  model_id,
  'Standard',
  TRUE,
  0,
  '[]'::jsonb
FROM (
  SELECT DISTINCT model_id
  FROM prices
  WHERE pricing_tier_id IS NULL
) AS distinct_models
ON CONFLICT (id) DO NOTHING;

-- Data Migration: Link existing prices to their default tiers using deterministic IDs
UPDATE prices
SET pricing_tier_id = model_id || '_tier_default'
WHERE pricing_tier_id IS NULL;

-- AlterTable: Make pricing_tier_id NOT NULL
ALTER TABLE "prices" ALTER COLUMN "pricing_tier_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_pricing_tier_id_fkey" FOREIGN KEY ("pricing_tier_id") REFERENCES "pricing_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX IF EXISTS "prices_model_id_usage_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "prices_model_id_usage_type_pricing_tier_id_key" ON "prices"("model_id", "usage_type", "pricing_tier_id");

COMMIT;
