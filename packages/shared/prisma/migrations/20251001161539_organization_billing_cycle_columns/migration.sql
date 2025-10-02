-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_cycle_anchor" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "billing_cycle_last_updated_at" TIMESTAMP(3),
ADD COLUMN     "billing_cycle_last_usage" INTEGER,
ADD COLUMN     "billing_cycle_usage_state" TEXT;

-- Backfill billing_cycle_anchor for existing organizations:
-- Step 1: Set to NULL for orgs WITH active subscriptions (will be backfilled from Stripe by worker job)
UPDATE "organizations"
SET "billing_cycle_anchor" = NULL;

-- Step 2: Set to created_at for orgs WITHOUT active subscriptions (free tier orgs)
UPDATE "organizations"
SET "billing_cycle_anchor" = "created_at"
WHERE 
    "cloud_config" IS NULL
    OR NOT (
      "cloud_config"::jsonb -> 'stripe' ? 'activeSubscriptionId'
      AND "cloud_config"::jsonb -> 'stripe' ->> 'activeSubscriptionId' IS NOT NULL
      AND "cloud_config"::jsonb -> 'stripe' ->> 'activeSubscriptionId' != ''
    );
