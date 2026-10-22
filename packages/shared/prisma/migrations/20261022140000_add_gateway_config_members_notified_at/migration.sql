-- AlterTable
ALTER TABLE "gateway_configs" ADD COLUMN IF NOT EXISTS "members_notified_at" TIMESTAMP(3);
