-- AlterTable
ALTER TABLE "audit_log_staging" ADD COLUMN     "failed_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT;
