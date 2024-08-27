-- AlterTable
ALTER TABLE "posthog_integrations" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
