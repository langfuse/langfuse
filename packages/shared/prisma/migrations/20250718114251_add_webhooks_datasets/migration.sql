-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "webhook_payload" JSONB,
ADD COLUMN     "webhook_url" TEXT;
