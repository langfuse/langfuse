-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "cloud_billing_cycle_anchor" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cloud_billing_cycle_updated_at" TIMESTAMP(3),
ADD COLUMN     "cloud_current_cycle_usage" INTEGER,
ADD COLUMN     "cloud_free_tier_usage_threshold_state" TEXT;

-- Backfill cloud_billing_cycle_anchor for existing organizations:
-- Step 1: Set to NULL for orgs WITH active subscriptions (will be backfilled from Stripe by worker job)
UPDATE "organizations"
SET "cloud_billing_cycle_anchor" = NULL;

-- Step 2: Set to created_at for orgs WITHOUT active subscriptions (free tier orgs)
UPDATE "organizations"
SET "cloud_billing_cycle_anchor" = "created_at"
WHERE
    "cloud_config" IS NULL
    OR NOT (
      "cloud_config"::jsonb -> 'stripe' ? 'activeSubscriptionId'
      AND "cloud_config"::jsonb -> 'stripe' ->> 'activeSubscriptionId' IS NOT NULL
      AND "cloud_config"::jsonb -> 'stripe' ->> 'activeSubscriptionId' != ''
    );
