-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_cycle_anchor" TIMESTAMP(3),
ADD COLUMN     "billing_cycle_last_updated_at" TIMESTAMP(3),
ADD COLUMN     "billing_cycle_last_usage" INTEGER;

-- CreateIndex
CREATE INDEX "organizations_billing_cycle_anchor_idx" ON "organizations"("billing_cycle_anchor");
