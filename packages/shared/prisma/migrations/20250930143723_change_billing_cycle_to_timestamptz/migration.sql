-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "billing_cycle_anchor" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "billing_cycle_last_updated_at" SET DATA TYPE TIMESTAMPTZ(3);
