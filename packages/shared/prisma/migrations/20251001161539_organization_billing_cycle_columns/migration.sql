-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_cycle_anchor" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "billing_cycle_last_updated_at" TIMESTAMP(3),
ADD COLUMN     "billing_cycle_last_usage" INTEGER,
ADD COLUMN     "billing_cycle_usage_state" TEXT;
