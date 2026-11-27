-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "public_sharing_disabled" BOOLEAN NOT NULL DEFAULT false;
