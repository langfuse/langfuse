-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ui_exports_disabled" BOOLEAN NOT NULL DEFAULT false;
