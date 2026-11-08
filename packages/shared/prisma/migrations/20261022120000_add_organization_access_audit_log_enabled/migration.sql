-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "access_audit_log_enabled" BOOLEAN NOT NULL DEFAULT false;
